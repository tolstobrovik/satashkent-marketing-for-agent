import { useEffect, useState } from 'react'
import { api } from './api.js'

// Whether the team's Google Drive takes uploads, for every box that offers one
// (HandIn, UploadField): 'on', 'off' — the server SAID it is not connected —
// or null while asking.
//
// A status that could not be read is not "off". It used to be: on 31 Oct 2026
// an editor whose session had run out mid-week got "Not authenticated" back,
// and every hand-in on the board quietly became a bare link box with no way
// to upload. Now it is asked again twice, and if it still cannot be read the
// drop zone stays — the upload itself then says what is wrong.
export function useDriveOn() {
  const [on, setOn] = useState(null)
  useEffect(() => {
    let live = true
    const ask = (n) => api.cached('/drive/status')
      .then((s) => { if (live) setOn(s?.connected ? 'on' : 'off') })
      .catch(() => {
        if (!live) return
        if (n < 2) setTimeout(() => ask(n + 1), 2000 * (n + 1))
        else setOn('unknown')
      })
    ask(0)
    return () => { live = false }
  }, [])
  return on
}
