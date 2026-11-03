// A kit Button with a hook for the tests around it (the kit's Button takes no data attributes):
//   html`<${Act} name="start" variant="primary" onClick=${…}>${T.start}<//>`   →   <span data-action="start"><button …>
import { html } from './html.js'
import { Button } from '../kit/index.js'

export const Act = ({ name, ...props }) => html`<span class="st-act" data-action=${name}><${Button} ...${props} /></span>`
