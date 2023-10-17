import { DroneData } from "./DroneData";
import { Socket } from "socket.io";

export interface Drone {
    data: DroneData;
    socket: Socket;
}