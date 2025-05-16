/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Tana Inbox Node ID - The Node ID for your Tana inbox. Right-click your inbox node in Tana, select 'Copy Node ID', and paste it here. */
  "tanaInboxNodeId"?: string,
  /** Tana Input API Key - Your Tana Input API key. Get it from https://tana.inc/docs/input-api. */
  "tanaApiKey"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `quick-clipboard-to-tana` command */
  export type QuickClipboardToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `paste-and-edit` command */
  export type PasteAndEdit = ExtensionPreferences & {}
  /** Preferences accessible in the `selected-to-tana` command */
  export type SelectedToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `youtube-to-tana` command */
  export type YoutubeToTana = ExtensionPreferences & {}
  /** Preferences accessible in the `youtube-to-tana-inbox` command */
  export type YoutubeToTanaInbox = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `quick-clipboard-to-tana` command */
  export type QuickClipboardToTana = {}
  /** Arguments passed to the `paste-and-edit` command */
  export type PasteAndEdit = {}
  /** Arguments passed to the `selected-to-tana` command */
  export type SelectedToTana = {}
  /** Arguments passed to the `youtube-to-tana` command */
  export type YoutubeToTana = {}
  /** Arguments passed to the `youtube-to-tana-inbox` command */
  export type YoutubeToTanaInbox = {}
}

