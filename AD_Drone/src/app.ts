import express from "express";
import { DroneData } from "./models/DroneData";
import io from "socket.io-client";
import { MovementDirection } from "./models/MovementDirection";
import { Kafka } from "kafkajs";
import { Position } from "./models/Position";

const APP_NAME = "AD_DRONE";
const APP = express();
const PORT: number = (process.argv[2] as unknown as number) || 3001;
const AD_ENGINE_PORT = process.argv[3] || 3000;
const ID_DRON: number = (process.argv[4] as unknown as number) || 1;
const FINAL_X_POSITION: number = (process.argv[5] as unknown as number) || 0;
const FINAL_Y_POSITION = (process.argv[6] as unknown as number) || 0;
const MOVEMENT_STEP_TIME = 500;
const SOCKET = io(`http://localhost:${AD_ENGINE_PORT}`, {
  query: {
    appName: APP_NAME,
    droneId: PORT - 3000,
  },
});
const KAFKA = new Kafka({
  clientId: APP_NAME,
  brokers: ["localhost:9092"],
});
const UPDATE_BOARD_CONSUMER = KAFKA.consumer({ groupId: `${APP_NAME} ${PORT}` });
const UPDATE_POSITION_PRODUCER = KAFKA.producer();

let dron: DroneData = {
  position: {
    x: 0,
    y: 0,
  },
  finalPosition: {
    x: FINAL_X_POSITION,
    y: FINAL_Y_POSITION,
  },
  id: ID_DRON,
  status: "RED",
};

SOCKET.on("connect", () => {
  console.log(`Conectado a AD_ENGINE en puerto ${AD_ENGINE_PORT}`);
  SOCKET.emit("auth", dron);
});

SOCKET.on("reset-drone-position", () => {
  console.log(`Reinicia el dron ${dron.id}`);
  dron.status = "RED";
  returnToHome();
});

// Escucha la orden de empezar a moverse
SOCKET.on("start-movement", (data) => {
  console.log("Movimiento inciado");
  console.log("x destino: " + data.xDestino);
  console.log("y destino: " + data.yDestino);
  dron.finalPosition.x = data.xDestino || dron.finalPosition.x;
  dron.finalPosition.y = data.yDestino || dron.finalPosition.y;
  moveDron();
});

async function moveDron() {
  if (
    dron.position.x == dron.finalPosition.x &&
    dron.position.y == dron.finalPosition.y
  ) {
    return;
  }
  let movement = getMovementDirection();
  dron.position.x += movement[0] as number;
  dron.position.y += movement[1] as number;
  if (
    dron.position.x == dron.finalPosition.x &&
    dron.position.y == dron.finalPosition.y
  ) {
    dron.status = "GREEN";
  } else {
    dron.status = "RED";
    setTimeout(() => moveDron(), MOVEMENT_STEP_TIME);
  }

  sendUpdatePositionKafka();
}

async function returnToHome() {
  if (dron.position.x == 0 && dron.position.y == 0) {
    return;
  }
  let movement = getMovementDirection({ x: 0, y: 0 });
  dron.position.x += movement[0] as number;
  dron.position.y += movement[1] as number;
  if (dron.position.x != 0 || dron.position.y != 0) {
    setTimeout(() => returnToHome(), MOVEMENT_STEP_TIME);
  }
  sendUpdatePositionKafka();
}


// Escucha el topic de actualizar el tablero
async function updateBoardTopic() {
  await UPDATE_BOARD_CONSUMER.connect();
  await UPDATE_BOARD_CONSUMER.subscribe({ topic: "update-board" });
  UPDATE_BOARD_CONSUMER.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log("Mensaje recibido en kafka, topic: " + topic);
      let tablero: string[][] = JSON.parse(message.value?.toString() || "{}");
      for (let fila of tablero) {
        console.log(fila.map((celda) => celda.split("-")[0]).join(" "));
      }
    },
  });
  await UPDATE_BOARD_CONSUMER.disconnect();
}

async function sendUpdatePositionKafka() {
  await UPDATE_POSITION_PRODUCER.connect();
  await UPDATE_POSITION_PRODUCER.send({
    topic: "update-position",
    messages: [{ key: "dron", value: JSON.stringify(dron) }],
  });
}

function getMovementDirection(
  position?: Position
): (typeof MovementDirection)[keyof typeof MovementDirection] {
  if (!position) {
    position = dron.finalPosition;
  }
  let x_diff = position.x - dron.position.x;
  let y_diff = position.y - dron.position.y;

  if (x_diff == 0 && y_diff > 0) {
    return MovementDirection.RIGHT;
  }
  if (x_diff == 0 && y_diff < 0) {
    return MovementDirection.LEFT;
  }

  if (x_diff > 0 && y_diff == 0) {
    return MovementDirection.DOWN;
  }
  if (x_diff < 0 && y_diff == 0) {
    return MovementDirection.UP;
  }

  if (x_diff > 0 && y_diff > 0) {
    return MovementDirection.DOWN_RIGHT;
  }
  if (x_diff < 0 && y_diff > 0) {
    return MovementDirection.UP_RIGHT;
  }

  if (x_diff > 0 && y_diff < 0) {
    return MovementDirection.LEFT;
  }
  if (x_diff < 0 && y_diff < 0) {
    return MovementDirection.UP_LEFT;
  }

  return MovementDirection.NONE;
}

// Iniciar el servidor
APP.listen(PORT, () => {
  console.log(`La aplicación está corriendo en http://localhost:${PORT}`);
  updateBoardTopic();
});
