if (process.env.STORAGE === 'electron') {
  var { dialog } = require('electron').remote

  module.exports = {
    alert: str => {
      var options = {
        type: 'warning',
        buttons: ["Ok"],
        defaultId: 0,
        cancelId:0,
        detail:str,
        message: ''
      }
      dialog.showMessageBoxSync(null, options)
    },
    confirm: str => {
      var options = {
        type: 'question',
        buttons: ["Ok", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        message: str
      }
      return dialog.showMessageBoxSync(null, options) === 0
    },
    urgent: str => {
      var options = {
        type: 'warning',
        buttons: ["Whoops!", "Yes", "No", "Cancel"],
        defaultId: 0,
        cancelId: 3,
        message: str + "\n\nClick YES (the second button.)"
      }
      return dialog.showMessageBoxSync(null, options) === 1
    }
  }
} else {
  module.exports = {
    alert: str => window.alert(str),
    confirm: str => window.confirm(str),
    urgent: str => window.prompt(str + "\n\nType YES to confirm.") == "YES"
  }
}
