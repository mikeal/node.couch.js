var sys = require("sys");

var store = {};
current_functions = [];

pairs = [];

var emit = function (key, value) {
  pairs.push([key, value]);
}

var output = function (obj) {
  sys.puts(JSON.stringify(obj)+'\n');
}

var loadFunc = function (func) {
  store[func] = eval(func);
}

var handler_map = { 
  add_fun: function(args) {
    var func = args[0];
    loadFunc(func);
    current_functions.push(func);
    return true;
  },
  map_doc: function(args) {
    var doc = args[0];
    var result = [];
    for (i in current_functions) {
      var func = current_functions[i];
      store[func](doc);
      result.push(pairs);
      pairs = [];
    }
    return result;
  }, 
  reset: function(args) {
    current_functions = [];
    return true;
  },
  reduce : function(args) {
    var funcs = args[0];
    var result = [];
    for (i in funcs) {
      var func = funcs[i];
      if (!func in store) {
        loadFunc(func);
      }
      var keys = [];
      var values = [];
      for (i in args[1]) {
        keys.push(args[1][0][0]);
        values.push(args[1][1]);
      }
      result.push(store[func](keys, values, false));
    }
    return [true, result];
  },
  rereduce : function(args) {},
  validate: function(args) {}, 
  show : function(args) {},
  list: function(args) {},
  list_row: function(args) {}, 
  list_end: function(args) {},
  filter: function(args) {},
  update: function(args) {},
};

var handleLine = function (line) {
  var line = JSON.parse(line);
  var r = handler_map[line.pop(0)](line);
  output(r);
}
process.stdio.open();
process.stdio.addListener("data", handleLine);

