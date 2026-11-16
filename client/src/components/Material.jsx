import { Clapperboard, Scissors, Palette } from 'lucide-react'
import { Face } from './CoachParts.jsx'
import MediaGrid, { Fold } from './MediaGrid.jsx'
import { useMaterial } from '../lib/demoMedia.js'
import { tr as tx } from '../lib/i18n.jsx'

// ---- the material: what was made, on the plate -------------------------------------
//
// The owner, 9 Nov 2026: "when the video is ready it should immediately show
// the real footage, with the preview — everything on the plate". Each kind of
// file is one block — its icon in the kind's colour, one word, a count, the
// face of whoever made it — over an even grid (MediaGrid.jsx). A block with
// nothing in it is not drawn.
//
// show: { footage: 'grid' | 'fold', edit: 'grid', cover: true }
// What is drawn is read off lib/demoMedia.js (the demo's stand-in for the
// team's Drive).

const head = (Icon, word, count, who) => (
  <>
    <Icon size={24} aria-hidden="true" />
    <h3>{word}</h3>
    {count ? <span className="tw-n">{count}</span> : null}
    {who && <Face person={who} size="xs" />}
  </>
)

export default function Material({ t, person, show = {} }) {
  const { footage, edit, cover } = useMaterial(t)
  return (
    <>
      {show.edit && edit.length > 0 && (
        <section className="co-blk tw-mat tw-k-cut">
          <MediaGrid files={edit} head={head(Scissors, tx('Edit'), `V${edit[edit.length - 1].version}`, person(edit[edit.length - 1].by))} />
        </section>
      )}
      {show.footage === 'grid' && footage.length > 0 && (
        <section className="co-blk tw-mat tw-k-shoot">
          <MediaGrid files={footage} head={head(Clapperboard, tx('Footage'), footage.length, person(footage[0].by))} />
        </section>
      )}
      {show.footage === 'compact' && footage.length > 0 && (
        <section className="co-blk tw-mat tw-k-shoot">
          <MediaGrid compact files={footage} head={head(Clapperboard, tx('Footage'), footage.length, person(footage[0].by))} />
        </section>
      )}
      {show.footage === 'fold' && footage.length > 0 && (
        <div className="tw-mat tw-k-shoot">
          <Fold icon={Clapperboard} title={tx('Footage')} count={footage.length}>
            <MediaGrid files={footage} head={person(footage[0].by) ? <Face person={person(footage[0].by)} size="xs" /> : <span />} />
          </Fold>
        </div>
      )}
      {show.cover && cover.length > 0 && (
        <section className="co-blk tw-mat tw-k-art">
          <MediaGrid files={cover} head={head(Palette, tx('Cover'), null, person(cover[0].by))} />
        </section>
      )}
    </>
  )
}
