import { Component, output, HostListener } from '@angular/core';
import { Direction } from '../../services/api.service';

@Component({
  selector: 'app-controls',
  standalone: true,
  templateUrl: './controls.html',
  styleUrl: './controls.css',
})
export class ControlsComponent {
  readonly action = output<string>();

  private keyMap: Record<string, string> = {
    'ArrowUp': 'N', 'ArrowDown': 'S', 'ArrowLeft': 'W', 'ArrowRight': 'E',
    'z': 'N', 'Z': 'N',
    's': 'S', 'S': 'S',
    'q': 'W', 'Q': 'W',
    'd': 'E', 'D': 'E',
    'b': 'build', 'B': 'build',
    'u': 'upgrade-ship', 'U': 'upgrade-ship',
    'r': 'refresh', 'R': 'refresh',
    't': 'show-taxes', 'T': 'show-taxes',
    'm': 'show-market', 'M': 'show-market',
    'i': 'show-islands', 'I': 'show-islands',
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
