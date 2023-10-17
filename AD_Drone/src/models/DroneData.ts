import { Position } from "./Position";

export interface DroneData {
    position: Position;
    finalPosition: Position;
    id: number;
    status: "RED" | "GREEN";
}