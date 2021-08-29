const { Sequelize } = require('sequelize')

async function up(db) {
  if (db.constructor.name !== 'SQLiteQueryInterface') {
    throw "Cannot migrate non-SQLite database"
  }

  //
  // Storage of cached documents (scraper rules, blog templates, etc)
  //
  await db.createTable('Caches', {
    path: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    },
    ownerId: {
      type: Sequelize.INTEGER,
      primaryKey: true
    },
    content: {
      type: Sequelize.STRING,
      allowNull: false
    }
  })

  //
  // Central storage of follow metadata
  //
  await db.createTable('Sources', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    //
    // If this is set, then the source is a local blog, owned by one a
    // local user
    //
    ownerId: {
      type: Sequelize.INTEGER,
    },
    url: {
      type: Sequelize.STRING,
      allowNull: false
    },
    feed: {
      type: Sequelize.STRING,
      allowNull: false
    },
    title: {
      type: Sequelize.STRING
    },
    avatar: {
      type: Sequelize.STRING
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updatedAt: {
      type: Sequelize.DATE
    },
    //
    // Cached computations like 'activity', as well as etcetera such as 'author'
    // and 'description' are stored here
    //
    json: {
      type: Sequelize.STRING
    }
  })

  await db.addIndex('Sources', ['url', 'feed'])

  //
  // Post history for each source
  //
  await db.createTable('Posts', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    sourceId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    kind: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    url: {
      type: Sequelize.STRING,
      allowNull: false
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false
    },
    publishedAt: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updatedAt: {
      type: Sequelize.DATE
    },
    //
    // Storage of 'author', 'photos', 'videos', etc.
    //
    json: {
      type: Sequelize.STRING
    }
  })

  await db.addIndex('Posts', ['sourceId'])

  //
  // User tag lists
  //
  await db.createTable('Tags', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    //
    // Storage of 'description' and 'icon'
    //
    json: {
      type: Sequelize.STRING,
    }
  })

  await db.addIndex('Tags', ['name'])
  await db.addIndex('Tags', ['userId', 'name'])

  //
  // User follows, including title changes and original URL supplied
  //
  await db.createTable('Follows', {
    sourceId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    tagId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    importance: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    flags: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    originalUrl: {
      type: Sequelize.STRING,
      allowNull: false
    },
    title: {
      type: Sequelize.STRING
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false
    },
    editedAt: {
      type: Sequelize.DATE,
      allowNull: false
    }
  })

  await db.addIndex('Follows', ['importance'])

  //
  // Users
  //
  await db.createTable('Users', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    nick: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    auth: {
      type: Sequelize.STRING
    },
    //
    // Primarily for settings storage
    //
    json: {
      type: Sequelize.STRING
    }
  })

  //
  // Full-text search tables
  //
  if (db.constructor.name === 'SQLiteQueryInterface') {
    await db.sequelize.query(`
      CREATE VIRTUAL TABLE PostContent USING fts5(description, title, text, html, json)
    `)
  }
}

//
// Don't want to risk deleting the DB through a migration... so just delete the
// DB if you need to go down to zero.
//
async function down(db) {
}

module.exports = { up, down }
