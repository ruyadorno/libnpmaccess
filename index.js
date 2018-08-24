'use strict'

const figgyPudding = require('figgy-pudding')
const getStream = require('get-stream')
const npa = require('npm-package-arg')
const npmFetch = require('npm-registry-fetch')
const {PassThrough} = require('stream')
const validate = require('aproba')

const AccessConfig = figgyPudding({
  Promise: {default: () => Promise}
})

const eu = encodeURIComponent
const npar = spec => {
  spec = npa(spec)
  if (!spec.registry) {
    throw new Error('`spec` must be a registry spec')
  }
  return spec
}

const cmd = module.exports = {}

cmd.public = (spec, opts) => setAccess(spec, 'public', opts)
cmd.restricted = (spec, opts) => setAccess(spec, 'restricted', opts)
function setAccess (spec, access, opts) {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    spec = npar(spec)
    validate('OSO', [spec, access, opts])
    const uri = `/-/package/${eu(spec.name)}/access`
    return npmFetch(uri, opts.concat({
      method: 'POST',
      body: {access},
      spec
    })).then(resolve, reject)
  }).then(res => res.body.resume() && true)
}

cmd.grant = (spec, scope, team, permissions, opts) => {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    spec = npar(spec)
    validate('OSSSO', [spec, scope, team, permissions, opts])
    scope = scope.replace(/^@/, '')
    if (permissions !== 'read-write' && permissions !== 'read-only') {
      throw new Error('`permissions` must be `read-write` or `read-only`. Got `' + permissions + '` instead')
    }
    const uri = `/-/team/${eu(scope)}/${eu(team)}/package`
    return npmFetch(uri, opts.concat({
      method: 'PUT',
      body: {package: spec.name, permissions},
      scope,
      spec
    })).then(resolve, reject)
  }).then(res => res.body.resume() && true)
}

cmd.revoke = (spec, scope, team, opts) => {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    spec = npar(spec)
    validate('OSSO', [spec, scope, team, opts])
    scope = scope.replace(/^@/, '')
    const uri = `/-/team/${eu(scope)}/${eu(team)}/package`
    return npmFetch(uri, opts.concat({
      method: 'DELETE',
      body: {package: spec.name},
      scope,
      spec
    })).then(resolve, reject)
  }).then(res => res.body.resume() && true)
}

cmd.lsPackages = (scope, team, opts) => {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    return getStream.array(
      cmd.lsPackages.stream(scope, team, opts)
    ).then(data => data.reduce((acc, [key, val]) => {
      if (!acc) {
        acc = {}
      }
      acc[key] = val
      return acc
    }, null)).then(resolve, reject)
  })
}

cmd.lsPackages.stream = (scope, team, opts) => {
  opts = AccessConfig(opts)
  validate('SSO|SZO', [scope, team, opts])
  scope = scope.replace(/^@/, '')
  let uri
  if (team) {
    uri = `/-/team/${eu(scope)}/${eu(team)}/package`
  } else {
    uri = `/-/org/${eu(scope)}/package`
  }
  opts = opts.concat({
    query: {format: 'cli'},
    mapJson (value, [key]) {
      if (value === 'read') {
        return [key, 'read-only']
      } else if (value === 'write') {
        return [key, 'read-write']
      } else {
        return [key, value]
      }
    }
  })
  const ret = new PassThrough({objectMode: true})
  npmFetch.json.stream(uri, '*', opts).on('error', err => {
    if (err.code === 'E404' && !team) {
      uri = `/-/user/${eu(scope)}/package`
      npmFetch.json.stream(uri, '*', opts).on(
        'error', err => ret.emit('error', err)
      ).pipe(ret)
    } else {
      ret.emit('error', err)
    }
  }).pipe(ret)
  return ret
}

cmd.lsCollaborators = (spec, user, opts) => {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    return getStream.array(
      cmd.lsCollaborators.stream(spec, user, opts)
    ).then(data => data.reduce((acc, [key, val]) => {
      if (!acc) {
        acc = {}
      }
      acc[key] = val
      return acc
    }, null)).then(resolve, reject)
  })
}

cmd.lsCollaborators.stream = (spec, user, opts) => {
  opts = AccessConfig(opts)
  spec = npar(spec)
  validate('OSO|OZO', [spec, user, opts])
  const uri = `/-/package/${eu(spec.name)}/collaborators`
  return npmFetch.json.stream(uri, '*', opts.concat({
    query: {format: 'cli', user: user || undefined},
    mapJson (value, [key]) {
      if (value === 'read') {
        return [key, 'read-only']
      } else if (value === 'write') {
        return [key, 'read-write']
      } else {
        return [key, value]
      }
    }
  }))
}

cmd.tfaRequired = (spec, opts) => setRequires2fa(spec, true, opts)
cmd.tfaNotRequired = (spec, opts) => setRequires2fa(spec, false, opts)
function setRequires2fa (spec, required, opts) {
  opts = AccessConfig(opts)
  return new opts.Promise((resolve, reject) => {
    spec = npar(spec)
    validate('OBO', [spec, required, opts])
    const uri = `/-/package/${eu(spec.name)}/access`
    return npmFetch(uri, opts.concat({
      method: 'POST',
      body: {publish_requires_tfa: required},
      spec
    })).then(resolve, reject)
  }).then(res => res.body.resume() && true)
}

cmd.edit = () => {
  throw new Error('Not implemented yet')
}
