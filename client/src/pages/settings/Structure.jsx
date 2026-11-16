// Team structure (12 Nov 2026, design-variants/admin-tz.md §2.1): the
// whiteboard of roles, people and who answers to whom — what was the Admin
// panel's Whiteboard section — on its own page, the full content width (the
// one page that ignores the 640 px column). The board itself is
// components/Whiteboard.jsx as it is: its logic, its auto-save, its boards.
// The wrapper keeps it inside the page: the field scrolls inside itself, the
// page never scrolls sideways (320 px included).
import Whiteboard from '../../components/Whiteboard.jsx'
import { tr as tx } from '../../lib/i18n.jsx'
import { Page } from './parts.jsx'

export default function Structure() {
  return (
    <Page title={tx('Team structure')} wide>
      <div className="co-st-wb">
        <Whiteboard />
      </div>
    </Page>
  )
}
