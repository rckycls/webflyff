// The module siteContent.ts (the Vite plugin) makes from apps/client/content/ when the page is built.
declare module 'virtual:site-content' {
  export interface NewsPost { date: string; title: string; html: string }
  /** The home page's content. `html` and `aboutHtml` are escaped HTML; `screenshots` are the pictures' URLs. */
  export const content: { news: NewsPost[]; aboutHtml: string; screenshots: string[] };
}
