//
// Fraidycat uses Hyperapp V1. I use my own module system (in hyperload.js)
// and a forked router (@kickscondor/router). This allows me to use the same
// code for Beaker Browser and the web extension.
//
import { h, app } from 'hyperapp'
import { hyperload } from './hyperload'
import 'babel-polyfill'

import follows from './follows'
import views from './view'

import '../css/fraidy.scss'

const {state, actions, view} = hyperload({
  modules: {follows},
  view: views
})

const {initialize} = app(state, actions, view, document.getElementById('fraidy'))
initialize()
