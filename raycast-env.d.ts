/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Video Tag - Supertag to use for YouTube videos (e.g., 'video', 'youtube') */
  "videoTag": string,
  /** Article Tag - Supertag to use for web articles (leave empty for no tag) */
  "articleTag": string,
  /** Transcript Tag - Supertag to use for transcripts (leave empty for no tag) */
  "transcriptTag": string,
  /** Note Tag - Supertag to use for clipboard/plain text notes (leave empty for no tag) */
  "noteTag": string,
  /** URL Field Name - Field name for URLs */
  "urlField": string,
  /** Author Field Name - Field name for authors/creators */
  "authorField": string,
  /** Transcript Field Name - Field name for transcript content */
  "transcriptField": string,
  /** Content Field Name - Field name for main content */
  "contentField": string,
  /** Include Author Field - Whether to include author/creator information in output */
  "includeAuthor": boolean,
  /** Include Description Field - Whether to include description information in output */
  "includeDescription": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `quick-clipboard-to-tana` command */
  export type QuickClipboardToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `paste-and-edit` command */
  export type PasteAndEdit = ExtensionPreferences & {}
  /** Preferences accessible in the `youtube-to-tana` command */
  export type YoutubeToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `copy-page-content-to-tana` command */
  export type CopyPageContentToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `copy-page-content-to-tana-with-selection` command */
  export type CopyPageContentToTanaWithSelection = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `quick-clipboard-to-tana` command */
  export type QuickClipboardToTana = {}
  /** Arguments passed to the `paste-and-edit` command */
  export type PasteAndEdit = {}
  /** Arguments passed to the `youtube-to-tana` command */
  export type YoutubeToTana = {}
  /** Arguments passed to the `copy-page-content-to-tana` command */
  export type CopyPageContentToTana = {}
  /** Arguments passed to the `copy-page-content-to-tana-with-selection` command */
  export type CopyPageContentToTanaWithSelection = {}
}

