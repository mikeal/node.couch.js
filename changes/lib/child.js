var Script = process.binding('evals').Script;
var stdin = process.openStdin();

stdin.setEncoding('utf8');

var buffer = '';
var listener;

var loadModule = function (doc) {
  var wrapper = "(function (exports, require, module, __filename, __dirname) { "
              + doc.changes
              + "\n});";
              
  var module = {exports:{},id:'changes'}
  
  var compiledWrapper = process.compile(wrapper, doc.changes);
  var p = compiledWrapper.apply(doc, [module.exports, require, module]);
  return module.exports;
}

stdin.on('data', function (chunk) {
  buffer += chunk.toString();
  while (buffer.indexOf('\n') !== -1) {
    line = buffer.slice(0, buffer.indexOf('\n'));
    buffer = buffer.slice(buffer.indexOf('\n') + 1);  
    var obj = JSON.parse(line);
    if ((obj[0]) === "ddoc") {
      listener = loadModule(obj[1]);
    } else if (obj[0] === "change") {
      listener(obj[1]);
    }
  }
});
