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
