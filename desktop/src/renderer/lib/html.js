// Preact + htm: components are functions, markup is a tagged template (no build step, no JSX).
//   html`<div class="st-x">${value}</div>`   ·   html`<${Component} prop=${v}>…<//>`
// Text inserted with ${…} is always text, never HTML (and the page's CSP makes innerHTML throw).
import { Fragment, createContext, h, render } from 'preact'
import htm from 'htm'

export const html = htm.bind(h)
export { Fragment, createContext, h, render }
export { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
