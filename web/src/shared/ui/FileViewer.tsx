import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { Link } from './Link';
import { OfflineIndicator, useRegisterNavBar } from './OfflineIndicator';
import type { PageBack } from './Page';

interface FileViewerProps {
  /** Already translated: the file's title, in the bar and as the frame's name. */
  title: string;
  /** Where the back button goes, and the title it shows. */
  back: PageBack;
  /** The bar's trailing slot, e.g. «Изменить». */
  actions?: ReactNode;
  /**
   * The file to show: an object URL and its content type. A PDF shows in the browser's own PDF
   * viewer, an image fitted to the screen.
   */
  file?: { url: string; contentType: string };
  /** Instead of the file: a loading message (`status`) or why it can't be shown (`alert`). */
  message?: { text: string; role: 'status' | 'alert' };
}

/**
 * A file full screen (a Document): a thin nav bar (back, the title, actions), then the file filling
 * the rest of the window, shown by the browser itself, so its own zoom, scrolling, sharing and
 * printing work.
 */
export function FileViewer({ title, back, actions, file, message }: FileViewerProps) {
  useRegisterNavBar();
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="border-b border-separator bg-bar pt-bar backdrop-blur-xl">
        <div className="mx-auto grid min-h-11 grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 px-safe-2">
          <div className="flex min-w-0 justify-start">
            <Link to={back.to} icon="back">
              {back.title}
            </Link>
          </div>
          <h1 className="truncate text-body font-semibold">{title}</h1>
          <div className="flex min-w-0 items-center justify-end gap-1">
            <OfflineIndicator />
            {actions}
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col pb-safe-0">
        {file === undefined ? (
          <EmptyState role={message?.role}>{message?.text}</EmptyState>
        ) : file.contentType.startsWith('image/') ? (
          <img src={file.url} alt={title} title={title} className="min-h-0 flex-1 object-contain" />
        ) : (
          <iframe src={file.url} title={title} className="min-h-0 w-full flex-1 bg-cell" />
        )}
      </main>
    </div>
  );
}
