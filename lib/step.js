/*
Copyright (c) 2012 Nils Kenneweg <beamgeraet@web.de>

Updated to my needs. Refactoring, JSLint Conformity.

Copyright (c) 2011 Tim Caswell <tim@creationix.com>

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var depth = 0, die = false;

function l0(number, count) {
	"use strict";
	number = number.toString();

	while (number.length < count) {
		number = "0" + number;
	}

	return number;
}

// Inspired by http://github.com/willconant/flow-js, but reimplemented and
// modified to fit my taste and the node.JS error handling system.
function step() {
	"use strict";
	depth += 1;

	var preErr = new Error();

	var steps = Array.prototype.slice.call(arguments),
		pending = 0,
		counter = 0,
		results = [],
		unflatten = false,
		lock = false,
		timing = step.timing,
		start = new Date().getTime(),
		previousTime = start,
		id = Math.floor(Math.random() * 100000);

	function tryCatchNextStep(fn, args) {
		// Run the step in a try..catch block so exceptions don't get out of hand.
		try {
			var result = fn.apply(next, args);

			if (typeof result !== "undefined" && typeof result.then === "function" && typeof result.nodeify === "function") {
				result.nodeify(next);
			} else {
				return result;
			}
		} catch (e) {
			// Pass any exceptions on through the next callback
			next(e);
		}
	}

	// Define the main callback that"s given as `this` to the steps.
	function next(err) {
		if (die) {
			return;
		}

		counter = pending = 0;

		// Check if there are no steps left
		if (steps.length === 0) {
			// Throw uncaught errors
			if (err) {
				console.log("throw due to end");
				if (preErr.stack) {
					console.log(preErr.stack);
				}
				console.log(err);
				throw err;
			}
			return;
		}

		// Get the next step to execute
		var fn = steps.shift();

		if (timing) {
			var functions = [fn];

			var name = "", i;
			for (i = 0; i < functions.length; i += 1) {
				if (typeof functions[i] !== "undefined") {
					name = name + ":" + functions[i].name;
				}
			}

			var dString = "";
			for (i = 1; i < depth; i += 1) {
				dString += "-";
			}

			var isErr = err ? "(E)" : "";
			var currentTime = new Date().getTime();
			var stack = "";

			if (preErr.stack) {
				stack = preErr.stack.split("\n")[2].replace(/^[^at]*at (.*).*/, "$1");
			}

			console.log(dString + l0(currentTime - start, 4) + ": Stepper " + isErr + " [" + l0(id, 5) + "] (" + l0(steps.length, 2) + "): " + name + " (" + (currentTime - previousTime) + ") " + stack);
			previousTime = currentTime;

			if (steps.length === 0) {
				depth -= 1;
			}
		}

		results = [];

		if (typeof fn !== "function") {
			if (preErr.stack) {
				console.log(preErr.stack);
			}
			next(new Error("Not a callable Function!"));
		}

		lock = true;
		var result = tryCatchNextStep(fn, arguments);

		if (counter > 0 && pending === 0) {
			unflatten = false;
			counter = 0;

			var cont = function contF() {
				// If parallel() was called, and all parallel branches executed
				// syncronously, go on to the next step immediately.
				next.apply(null, results);
			};

			if (typeof process !== "undefined") {
				process.nextTick(cont);
			} else {
				cont();
			}
		} else if (typeof result !== "undefined") {
			if (typeof process !== "undefined") {
				process.nextTick(function () {
					// If a syncronous return is used, pass it to the callback
					next(undefined, result);
				});
			} else {
				next(undefined, result);
			}
		}
		lock = false;
	}

	/** just call the next argument with null as the first value
	* makes it easier to highlight that no error should be passed
	*/
	next.ne = function () {
		var rArgs = Array.prototype.slice.call(arguments);
		rArgs.unshift(null);

		next.apply(null, rArgs);
	};

	/** just skip all calls and go directly to the last callback */
	next.last = function () {
		while (steps.length > 1) {
			steps.shift();
		}

		next.apply(null, arguments);
	};

	/** skip all calls and go directly to the last callback and add no error */
	next.last.ne = function () {
		var rArgs = Array.prototype.slice.call(arguments);
		rArgs.unshift(null);

		next.last.apply(null, rArgs);
	};

	/** skip a certain number of callbacks
	* @param remove number of callbacks to skip
	* @return function to call
	*/
	next.skip = function (remove) {
		return function () {
			var i;
			for (i = 0; i < remove; i += 1) {
				steps.shift();
			}

			next.apply(null, arguments);
		};
	};

	// Add a special callback generator `this.parallel()` that groups stuff.
	next.parallel = function () {
		if (die) {
			return;
		}

		var index = counter;
		counter += 1;
		pending += 1;

		var parallelFunction = function (err) {
			pending -= 1;
			// Compress the error from any result to the first argument
			if (err) {
				results[0] = err;
			}
			// Send the other results as arguments

			if (unflatten) {
				results[index + 1] = arguments[1];
			} else {
				var i = 1;
				for (i = 1; i < arguments.length; i += 1) {
					if (typeof results[i] === "undefined") {
						results[i] = [];
					}

					results[i][index] = arguments[i];
				}
			}

			if (!lock && pending === 0 && counter > 0) {
				counter = 0;
				unflatten = false;

				// When all parallel branches done, call the callback
				next.apply(null, results);
			}
		};

		return parallelFunction;
	};

	next.parallel.unflatten = function () {
		unflatten = true;
	};

	// Start the engine and pass nothing to the first step.
	next();
}

step.multiplex = function (callbacks) {
	return function () {
		var args = arguments;
		callbacks.forEach(function (callback) {
			callback.apply(this, args);
		}, this);
	};
};

step.die = function () {
	"use strict";
	die = true;
};

// Tack on leading and tailing steps for input and output and return
// the whole thing as a function.  Basically turns step calls into function
// factories.
step.fn = function StepFn() {
	"use strict";
	var steps = Array.prototype.slice.call(arguments);
	return function () {
		var args = Array.prototype.slice.call(arguments);

		// Insert a first step that primes the data stream
		var toRun = [function () {
				this.apply(null, args);
			}].concat(steps);

		// If the last arg is a function add it as a last step
		if (typeof args[args.length - 1] === "function") {
			toRun.push(args.pop());
		}

		step.apply(null, toRun);
	};
};

step.unpromisify = function (promise, cb) {
	"use strict";
	if (cb) {
		promise.then(function (result) {
			cb(null, result);
		}, cb);
	}

	return promise;
};

step.startTiming = function () {
	"use strict";
	step.timing = true;
};

step.stopTiming = function () {
	"use strict";
	step.timing = false;
};

step.timing = false;

// Hook into commonJS module systems
if (typeof module !== "undefined" && module.hasOwnProperty("exports")) {
	module.exports = step;
}

if (typeof define !== "undefined") {
	define([], function () {
		"use strict";
		return step;
	});
}
