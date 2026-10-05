# iOS reader status bar

`ReaderStatusBar` gives iOS Home Screen apps a fixed edge from which to sample
the EPUB reading color. The normal `black-translucent` metadata remains in
`client/index.html`, and `useReaderThemeColor` still synchronizes the body and
`theme-color`. Native iOS 27 testing showed that an app installed with the old
`default` status-bar style could retain white chrome despite loading that metadata.

The component belongs inside the EPUB reader root. That root owns
`--reader-top-inset`: the safe-area inset in browser tabs, or at least 12px in iOS
Home Screen apps. The edge, text padding and bookmark position consume the same
value. The 12px minimum was verified on iOS 27 when the reported safe inset was
zero. Keep the edge below the toolbar and panels, and remove it while sidebar or
search is open. A null color and component unmount both remove the element.

This depends on native browser behavior. DOM tests cover rendering and cleanup;
they cannot verify the color behind the iOS clock. Repeat the native checks when
changing this feature or adopting a new major iOS version.

## Native regression recipe

Use a disposable iOS Simulator or a test device. User-agent emulation and desktop
WebKit do not exercise the installed app's native status bar. Use a book's reader
preview, with `mode=peek` in the URL, to avoid changing reading progress.

1. In a fresh Safari document, install BookOrbit with its normal metadata, enable
   Open as Web App, and launch the Home Screen icon. Confirm
   `navigator.standalone === true` in the installed page.
2. Open a brown EPUB preview. Capture a native device screenshot and record the
   status-bar meta value, `theme-color`, viewport size, visual viewport offset,
   safe-area top inset and the computed `--reader-top-inset`. The clock background
   should match the reader. The tested fresh iOS 27 installation reported a 62px
   safe inset.
3. Remove that test installation. In Safari, change only the live document's
   status-bar metadata before installing again:

   ```js
   document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content = 'default'
   ```

   This changes the test document, not the server. Launch the new icon normally
   so it loads the unmodified current release. Verify its document metadata is
   `black-translucent`. When available, inspect the Simulator WebClip's
   `WebClipStatusBarStyle` to confirm installation with `Default`. The tested
   iOS 27 installation reported a zero safe inset; the reserved inset must still
   be 12px and the native clock background must match the reader.

4. Change reading colors, show and hide the toolbar, and open and close sidebar,
   search and settings. Check controls and text remain visible. Include zero
   vertical margin and hidden page information to catch content overlap.
5. Return to the library and reopen the preview. The native bar must follow the
   library color on exit and the reading color on re-entry. Repeat after fully
   quitting and launching the installed app.

Capture the same native screenshots before and after the change. A DOM screenshot
or a matching `theme-color` alone is insufficient. Restore the Safari test
metadata or close that document, then remove the disposable installation.

## Retiring the workaround

Keep the standard metadata even if this component is removed. Retire the edge and
its minimum inset together only after both installation cases pass these native
checks without it on the iOS versions the app supports.

Apple documents the status-bar metadata and `navigator.standalone` in its
[Safari HTML reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html).
[WebKit report 316008](https://bugs.webkit.org/show_bug.cgi?id=316008) describes
installation-dependent metadata behavior; it is a reporter's reproduction, not a
guarantee that this workaround will remain necessary or sufficient.
