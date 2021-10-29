const { Sequelize, Model } = require('sequelize')

class Caches extends Model {}
class Global extends Model {}

function connect(sequelize) {
  Global.init({
    key: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    },
    json: {
      type: Sequelize.STRING
    }
  }, {
    timestamps: false,
    sequelize
  })

  Caches.init({
    path: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    },
    ownerId: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      allowNull: true
    },
    content: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }, {
    sequelize
  })
}

module.exports = { Global, Caches, connect }
