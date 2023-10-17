import { Component } from '@angular/core';
import { io } from 'socket.io-client';
import { SocketService } from 'src/app/services/socket.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  message: string = '';

  public rows: number = 20;

  public cols: number = 20;

  public tablero: string[][] = [
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' '],
  ];

  constructor(private socketService: SocketService) {}

  sendMessage() {
    this.socketService.sendMessage(this.message);
    this.message = ''; // Limpia el campo de entrada
  }

  ngOnInit() {
    this.socketService.onMessageReceived((message: any) => {
      // Maneja los mensajes recibidos del servidor
      let newTablero = message.tempTablero;
      console.log('Mensaje recibido:', message);
      this.tablero = newTablero;
    });
  }

  startDrones() {
    this.socketService.startDronesApps();
  }

  startDronesMovement() {
    this.socketService.startDroneMovement();
  }

  resetDronesPositions() {
    this.socketService.resetDronesPositions();
  }

  isGreen(celda:string): boolean {
    return celda.split("-")[0] === 'O'
  }

  isRed(celda:string): boolean {
    return celda.split("-")[0] === 'X'
  }

  getId(celda:string): string {
    return celda.split("-")[1]
  }
}
