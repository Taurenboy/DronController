import express from "express";
import { exec, ExecOptions } from "child_process";
import http from "http"; // Importa el módulo http
import { Server, Socket } from "socket.io";
import path from "path";
import { DroneData } from "./models/DroneData";
import * as _ from "lodash";
import cors from "cors";
import { Kafka } from "kafkajs";
import { Drone } from "./models/Drone";
import { figuras, tablero } from "./figuras/FigurasContainer";

const APP_NAME = "AD_ENGINE";
const TIME_TO_NEXT_FIGURE = 1000;
const TIME_TO_RESET_POSITION = 2000;
const PORT = process.argv[2] || 3000;
const APP = express();
// Kafka
const KAFKA = new Kafka({
  clientId: "AD_ENGINE",
  brokers: ["localhost:9092"],
});
const UPDATE_POSITION_CONSUMER = KAFKA.consumer({ groupId: `AD_ENGINE` });
const PRODUCER = KAFKA.producer();
// Socketts
const SERVER = http.createServer(APP); // Crea un servidor http utilizando Express
const IO = new Server(SERVER, { transports: ["websocket", "polling"] }); // Crea una instancia de Socket.IO

// Variables
let tablero_sockets: Socket[] = [];
let runningDronesList: Drone[] = [];
// let tablero: string[][] = [
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
//   [" ", " ", " ", " ", " ", " ", " "],
// ];

var figuraActual: number = 0;

// Configura el evento de conexión de Socket.IO
IO.on("connection", (socket) => {
  const appName = socket.handshake.query.appName;
  console.log("Un cliente se ha conectado en AD_ENGINE: " + appName);
  if (appName === "AD_DRONE") {
    //handle de auth socket event
    socket.on("auth", (dron: DroneData) => {
      console.log(`Registra el dron: ${JSON.stringify(dron)}`);
      let dronInDrones = runningDronesList.filter((d) => d.data.id == dron.id)[0];
      if (dronInDrones) {
        dronInDrones.data.position = dron.position;
        dronInDrones.data.status = dron.status;
      } else {
        runningDronesList.push({ data: dron, socket });
      }
    });
  } else {
    tablero_sockets.push(socket);
    //START DRON APPs
    socket.on("start-drone", () => {
      const adDroneDir = path.resolve("../AD_Drone");
      const options: ExecOptions = {
        cwd: adDroneDir,
        timeout: 50,
      };
      let dronesAppRunning: number[] = runningDronesList.map((d) => d.data.id);
      if (figuraActual >= figuras.length) figuraActual = 0;
      for (let punto of figuras[figuraActual].puntos) {
        let dronPort: number = 3000 + punto.idDron;
        if (!dronesAppRunning.find((dId) => dId == punto.idDron)) {
          exec(
            `start npm start ${dronPort} ${PORT} ${punto.idDron} ${punto.x_destino} ${punto.y_destino} &`,
            options,
            (error, stdout, stderr) => {
              if (error) {
                console.error("Error starting AD_Drone:", error);
              } else {
                console.log("AD_Drone started in port: " + dronPort);
              }
            }
          );
        }
      }
    });

    // START DRONE MOVEMENT
    socket.on("start-movement", () => {
      handleStartMovement();
    });

    //RESET ALL DRONES POSITIONS
    socket.on("reset-drone-position", () => {
      handleResetDronPositions();
    });
  }

  // Handles the disconnect event
  socket.on("disconnect", () => {
    if (appName === "AD_DRONE") {
      const droneId: number = socket.handshake.query
        .droneId as unknown as number;
      runningDronesList = runningDronesList.filter((d) => d.data.id != droneId);
    } else {
      tablero_sockets.splice(tablero_sockets.indexOf(socket));
    }
    console.log("Un cliente se ha desconectado");
    emitBoardToFront(printBoard());
  });
});

function handleResetDronPositions() {
  runningDronesList.forEach((droneSocket) => {
    droneSocket.socket.emit("reset-drone-position", {});
  });
}

function handleStartMovement() {
  if (figuraActual >= figuras.length) {
    figuraActual = 0;
  }
  runningDronesList.forEach((dron) => {
    let dronePoint = figuras[figuraActual].puntos.find(
      (point) => point.idDron == dron.data.id
    );
    dron.socket.emit("start-movement", {
      xDestino: dronePoint?.x_destino,
      yDestino: dronePoint?.y_destino,
    });
    console.log("Start drone movement for dron with id: " + dron.data.id);
  });
}

function printBoard(): string[][] {
  var tempTablero = _.cloneDeep(tablero);
  for (let dron of runningDronesList) {
    tempTablero[dron.data.position.x][dron.data.position.y] =
      dron.data.status == "GREEN" ? `O-${dron.data.id}` : `X-${dron.data.id}`;
  }

  //Print in console joined
  for (let fila of tempTablero) {
    console.log(fila.map((celda) => celda.split("-")[0]).join(" "));
  }
  return tempTablero;
}

function emitBoardToAll() {
  let board = printBoard();
  emitBoardToDrones(board);
  emitBoardToFront(board);
}

function emitBoardToFront(tempTablero: string[][]) {
  tablero_sockets.forEach((ts) => ts.emit("tablero", { tempTablero }));
}

async function emitBoardToDrones(tempTablero: string[][]) {
  await PRODUCER.connect();
  await PRODUCER.send({
    topic: "update-board",
    messages: [{ key: "board", value: JSON.stringify(tempTablero) }],
  });
}

// Escucha el topic de actualizar posicion del dron
async function updatePositionKafkaTopic() {
  await UPDATE_POSITION_CONSUMER.connect();
  await UPDATE_POSITION_CONSUMER.subscribe({ topic: "update-position" });
  UPDATE_POSITION_CONSUMER.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log("Mensaje recibido en kafka, topic : " + topic);
      let dron: DroneData = JSON.parse(message.value?.toString() || "{}");
      console.log(`Posicion actualizada: ${JSON.stringify(dron)}`);
      updateAllDronesStatus();
      let dronToUpdate = runningDronesList.find((d) => d.data.id == dron.id);
      if (!dronToUpdate) return;
      dronToUpdate.data.position = dron.position;
      dronToUpdate.data.status = dron.status;
      emitBoardToAll();
      checkFigureStatus();
    },
  });
  await UPDATE_POSITION_CONSUMER.disconnect();

  //Used only in eachMessage handler
  function checkFigureStatus() {
    var figureCompleted = runningDronesList
      .map((d) => d.data.status)
      .every((status) => status == "GREEN");
    if (figureCompleted && figuraActual < figuras.length) {
      figuraActual += 1;
      // If its the last figure, reset drone position
      if (figuraActual >= figuras.length) {
        setTimeout(() => handleResetDronPositions(), TIME_TO_RESET_POSITION);
      } else {
        // else start the next figure
        setTimeout(() => handleStartMovement(), TIME_TO_NEXT_FIGURE);
      }
    }
  }
  //Used only in eachMessage handler
  function updateAllDronesStatus() {
    runningDronesList.forEach((dron) => {
      let dronPoint = figuras[figuraActual]?.puntos.find(
        (point) => point.idDron == dron.data.id
      );
      if (dronPoint) {
        dron.data.status =
          dron.data.position.x == dronPoint.x_destino &&
          dron.data.position.y == dronPoint.y_destino
            ? "GREEN"
            : "RED";
      }
    });
  }
}


// Iniciar el servidor
SERVER.listen(PORT, () => {
  console.log(`La aplicación está corriendo en http://localhost:${PORT}`);
  updatePositionKafkaTopic();
});
