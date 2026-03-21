import { Component, output, HostListener } from '@angular/core';

@Component({
  selector: 'app-controls',
  standalone: true,
  templateUrl: './controls.html',
  styleUrl: './controls.css',
})
export class ControlsComponent {
  readonly action = output<string>();

  private keyMap: Record<string, string> = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'z': 'up', 'Z': 'up',
    's': 'down', 'S': 'down',
    'q': 'left', 'Q': 'left',
    'd': 'right', 'D': 'right',
    'e': 'interact', 'E': 'interact',
    'u': 'upgrade', 'U': 'upgrade',
    'i': 'inventory', 'I': 'inventory',
    'p': 'status', 'P': 'status',
    'r': 'scan', 'R': 'scan',
    'a': 'attack', 'A': 'attack',
    ' ': 'wait',
  };

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const action = this.keyMap[event.key];
    if (action) {
      event.preventDefault();
      this.action.emit(action);
    }
  }

  onAction(action: string) {
    this.action.emit(action);
  }
}

