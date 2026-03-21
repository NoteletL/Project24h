import { Component, signal, ElementRef, viewChild, HostListener } from '@angular/core';

@Component({
  selector: 'app-help-panel',
  standalone: true,
  templateUrl: './help-panel.html',
  styleUrl: './help-panel.css',
})
export class HelpPanelComponent {
  readonly isOpen = signal(false);

  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');
  private readonly panelEl    = viewChild<ElementRef<HTMLDivElement>>('panelEl');
  private readonly closeBtn   = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  open(): void {
    this.isOpen.set(true);
    setTimeout(() => this.closeBtn()?.nativeElement.focus(), 50);
  }

  close(): void {
    this.isOpen.set(false);
    setTimeout(() => this.triggerBtn()?.nativeElement.focus(), 50);
  }

  /** Ouvre avec le raccourci H (sauf si un champ de saisie est actif) */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if ((event.key === 'h' || event.key === 'H') && !this.isOpen()) {
      event.preventDefault();
      this.open();
    }
  }

  /** Ferme sur clic en dehors du panneau */
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('help-overlay')) {
      this.close();
    }
  }

  /** Gestion clavier dans le dialogue : Échap + focus trap Tab */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = this.panelEl()?.nativeElement;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

