// The phone's flight buttons (Piece 7 M5, Decision 4): in the air the ground's Jump gives way to Accelerate (held: the
// thrust starts at the press and stops at the let-go), with Turbo (a toggle, as X) and Land (the worn ride used) beside it.
// Attack stays. They are `AttackButton`s, so they show by the same touch rule, and their group shows only while flying.

import { AttackButton } from './attackButton';

export interface FlightButtonActions {
  /** Accelerate pressed (true) or let go (false). */
  accelerate(held: boolean): void;
  turbo(): void;
  land(): void;
}

export class FlightButtons {
  readonly element: HTMLDivElement;
  private readonly accelerate: AttackButton;
  private readonly turbo: AttackButton;
  private readonly land: AttackButton;

  constructor(doc: Document, actions: FlightButtonActions) {
    const element = doc.createElement('div');
    element.className = 'hud-flight';
    element.hidden = true;
    const make = (name: string, label: string, onPress: () => void, onRelease?: () => void, shown = label): AttackButton => {
      const button = new AttackButton(onPress, doc, { label, className: `hud-flight-button hud-flight-${name}`, onRelease });
      button.element.dataset.flight = name;
      button.element.dataset.label = shown; // the text drawn, 14 px, short enough for the circle
      element.append(button.element);
      return button;
    };
    this.accelerate = make('accelerate', 'Accelerate', () => actions.accelerate(true), () => actions.accelerate(false), 'Go');
    this.turbo = make('turbo', 'Turbo', () => actions.turbo());
    this.land = make('land', 'Land', () => actions.land());
    this.element = element;
  }

  /** Shown while the own mover flies; Turbo is enabled while the turbo has fuel (`m_tmAccFuel > 0`). */
  update(flying: boolean, turboAvailable: boolean): void {
    if (this.element.hidden === flying) this.element.hidden = !flying;
    this.accelerate.update(flying);
    this.land.update(flying);
    this.turbo.update(flying && turboAvailable);
  }

  dispose(): void {
    this.accelerate.dispose();
    this.turbo.dispose();
    this.land.dispose();
    this.element.remove();
  }
}
