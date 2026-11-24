// Shapes used by more than one part of the browser.

/** A file on its way, or that was. `temp` is where it is held until it is whole and agreed to. */
export interface Download {
  id: number;
  name: string;
  site: string;
  item: Electron.DownloadItem;
  temp: string;
  state: 'asking' | 'going' | 'saved' | 'cancelled' | 'failed';
  agreed: boolean;
  /** All of it came while the question was still up. */
  arrived: boolean;
}
/** What pointer mode sends a page: a move, the button going down or up, or a wheel turn (`dy` positive scrolls down). */
export type Mouse = { type: 'move' } | { type: 'down' | 'up' } | { type: 'wheel'; dx: number; dy: number };
