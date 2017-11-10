var nest = require('depnest')
var ref = require('ssb-ref')
var MutantArray = require('mutant/array')
var concat = require('mutant/concat')

var { computed } = require('mutant')

exports.needs = nest({
  'message.sync.unbox': 'first',
  'backlinks.obs.for': 'first'
})

exports.gives = nest({
  'sbot.hook.publish': true,
  'message.obs.flags': true
})

exports.create = function (api) {
  var activeFlags = new Set()
  return nest({
    'sbot.hook.publish': (msg) => {
      if (!(msg && msg.value && msg.value.content)) return
      if (typeof msg.value.content === 'string') {
        msg = api.message.sync.unbox(msg)
        if (!msg) return
      }

      var c = msg.value.content
      if (c.type !== 'vote') return
      if (!c.vote || !c.vote.link) return

      activeFlags.forEach((flags) => {
        if (flags.id === c.vote.link) {
          flags.push(msg)
        }
      })
    },
    'message.obs.flags': (id) => {
      if (!ref.isLink(id)) throw new Error('an id must be specified')
      var obs = get(id)
      obs.id = id
      var result = computed(obs, getFlags, {
        // allow manual append for simulated realtime
        onListen: () => activeFlags.add(obs),
        onUnlisten: () => activeFlags.delete(obs)
      })
      result.sync = obs.sync
      return result
    }
  })

  function get (id) {
    var backlinks = api.backlinks.obs.for(id)
    var merge = MutantArray()

    var flags = computed([backlinks.sync, concat([backlinks, merge])], (sync, backlinks) => {
      if (sync) {
        return backlinks.reduce((result, msg) => {
          var c = msg.value.content
          if (c.type === 'vote' && c.vote && c.vote.link === id) {
            var value = result[msg.value.author]
            if (!value || value[0] < msg.value.timestamp) {
              // TODO store reasons
              result[msg.value.author] = [msg.value.timestamp, c.vote.value, c.vote.expression]
            }
          }
          return result
        }, {})
      } else {
        return {}
      }
    })

    flags.push = merge.push
    flags.sync = backlinks.sync
    return flags
  }
}

function getFlags (flags) {
  return Object.keys(flags).reduce((result, id) => {
    if (flags[id][1] < 0) {
      result.push(id)
    }
    return result
  }, [])
}
