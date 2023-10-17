import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: any;

  constructor() {
    // Configura la conexión al servidor de sockets
    this.socket = io('http://localhost:3000', {
      query: {
        appName: 'AD_UI', // Nombre de la aplicación
      },
      transports: ['websocket', 'polling']
    });
  }

  sendMessage(message: string) {
    this.socket.emit('chatMessage', message);
  }

  startDronesApps() {
    this.socket.emit('start-drone');
  }

  startDroneMovement() {
    this.socket.emit('start-movement');
  }

  resetDronesPositions() {
    this.socket.emit('reset-drone-position');
  }


  onMessageReceived(callback: (message: string) => void) {
    this.socket.on('tablero', (message: string) => {
      callback(message);
    });
  }
}
