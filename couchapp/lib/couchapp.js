var sys = require('sys'),
    path = require('path');

exports.addModuleTree = function () {}

var abspath = function (pathname) {
  return path.join(process.env.PWD, path.normalize(pathname));
}

var optionparser = require('./dep/optionparser')

// sandbox.emit = Views.emit;
// sandbox.sum = Views.sum;
// sandbox.log = log;
// sandbox.toJSON = Couch.toJSON;
// sandbox.provides = Mime.provides;
// sandbox.registerType = Mime.registerType;
// sandbox.start = Render.start;
// sandbox.send = Render.send;
// sandbox.getRow = Render.getRow;

function sum (values) {
  var rv = 0;
  for (var i in values) {
    rv += values[i];
  }
  return rv;
}

var toJSON = JSON.stringify;

function compileMapReduce (func, ddoc, emit) {
  var source = "(function (emit, sum, toJSON, log) { return (" + func.toString() + ")\n});"
  return eval(source).apply(ddoc, [emit, sum, toJSON, function () {}])
}

function testDesignDoc (name, ddoc) {
  for (view in ddoc.views) {
    if (ddoc.views[view].map) {
      var fullname = name+'.views.'+view+'.map';
      sys.print(fullname+' compilation test')
      var m = compileMapReduce(ddoc.views[view].map, ddoc, function(k,v){})
      sys.print('.... passed\n')
      sys.print(fullname+' empty document test.... ')
      try { m({}) ; sys.print('passed\n')}
      catch(e) { sys.print('failed\n')}
      
      if (ddoc.tests && ddoc.tests.views && ddoc.tests.views[view] && ddoc.tests.views[view].map) {
        if (ddoc.tests.views[view].map.expect) {
          sys.print(fullname+' expect tests.... ')
          var docs = ddoc.tests.views[view].map.expect[0];
          var expected = ddoc.tests.views[view].map.expect[1];
          var results = []; 
          var emit = function(k,v) {results.push([k,v])}
          var m = compileMapReduce(ddoc.views[view].map, ddoc, emit);
          docs.forEach(function(doc) {m(doc)});
          if (results.length != expected.length) {
            sys.print('failed (lengths do not match)\n')
          } else {
            var p = true;
            for (var i=0;i<results.length;i+=1) {
              if (toJSON(results[i]) != toJSON(expected[i])) {
                sys.print('\nFAIL: ' + toJSON(results[i]) + ' != ' + toJSON(expected[i]) )
                p = false;
              }
            }
            if (!p) { sys.print('\n') }
            else {sys.print('passed \n')}
          }
        }
      }
      
      
    }
  }
}

var opts = new optionparser.OptionParser();
opts.addOption('-d', '--design', 'string', 'design', null, "File or directory for design document(s)")
opts.addOption('-t', '--test', 'bool', 'test', false, "Run tests.")
opts.addOption('-c', '--couch', 'string', 'couchul', null, "Url to couchdb.")

opts.ifScript(__filename, function (options) {
  if (options.design) {
    var design = abspath(options.design);
    var module = require(design.slice(0, design.length - (path.extname(design).length)))
    var ddocs = [];
    for (name in module) {
      ddocs.push([name, module[name]]);
    }
    if (options.test) {
      ddocs.forEach(function (d) {testDesignDoc(d[0], d[1])})
    }
  }
}, true) 