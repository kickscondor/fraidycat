import { location } from "@kickscondor/router"

let locationOpts = {}
if (process.env.STORAGE !== 'dat') {
  locationOpts = {hashRouting: true}
}

export const hyperload = tree => {
  const modules = {}

  for (let name in (tree.modules || {})) {
    modules[name] = hyperload(tree.modules[name])
  }

  const state = tree.state || {}
  const actions = tree.actions || {}
  const view = tree.view

  modules.location = location(locationOpts)
  for (let name in modules) {
    state[name] = modules[name].state || {}
    actions[name] = Object.assign({set: o => o}, modules[name].actions)
  }

  actions.initialize = _ => (_, actions) => {
    modules.location.subscribe(actions.location)

    if (typeof(actions.init) !== 'undefined') {
      actions.init()
    }
    for (let name in modules) {
      let init = actions[name].init
      if (init) init()
    }
  }

  return {state, actions, view}
}
