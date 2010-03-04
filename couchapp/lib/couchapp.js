var sys = require('sys'),
    path = require('path'),
    fs = require('fs'),
    sync = require('./sync');

function normalizeDesignDoc (ddoc, parent) {
  for (x in ddoc) {
    if (parent || x[0] != '_') {
      if (typeof ddoc[x] == 'function') {
        ddoc[x] = ddoc[x].toString();
      } else if (typeof(ddoc[x]) == 'object' && ddoc[x].length === undefined){
        normalizeDesignDoc(ddoc[x], ddoc)
      }
    }
  }
  return ddoc;
}

function walk (dir, files) {
  if (!files) { files = [] }
  newfiles = fs.readdirSync(dir);
  newfiles.forEach(function (f) {
    var f = path.join(dir, f)
    // exclude . files
    if (f[0] == '.') {return;}
    var stats = fs.statSync(f)
    if (stats.isDirectory()) {
      walk(f, files);
    } else if (stats.isFile()) {
      files.push(f);
    }
  })
  return files;
}

function loadAttachments (ddoc, dir) {
  var files = walk(dir);
  if (!ddoc._attachments) {
    ddoc._attachments = {};
  }
  files.forEach(function (f) {
    f = f.slice(dir.length);
    ddoc._attachments[f] = function (callback) {
      fs.readFile(path.join(dir, f), function (error, data) {
        if (error) {
          sys.puts(sys.inspect([dir, f]))
          callback(error);
        } else {
          callback(undefined, false, mimetypes.lookup(path.extname(f).slice(1)), data.length, function (c) {c(undefined, data)})
        }
      })
    }
  })
}

exports.loadAttachments = loadAttachments;

exports.sync = function (ddoc, uri, callback) {
  return sync.sync(normalizeDesignDoc(ddoc), uri, undefined, callback)
}



