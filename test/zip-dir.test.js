/**
 * Copyright (c) 2013 Jordan Santell

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

var Zip = require("jszip");
var unzip = require("unzip");
var zipDir = require("../index");
var path = require("path");
var fs = require("fs-extra");
var bufferEqual = require("buffer-equal");
var chai = require("chai");
var expect = chai.expect;

var sampleZipPath = path.join(__dirname, "fixtures/sampleZip");
var emptySubFolderSampleZipPath = path.join(__dirname, "fixtures/emptySubFolderSampleZip");
var xpiPath = path.join(__dirname, "my.xpi");
var outputPath = path.join(__dirname, "myxpi/");
var emptyDirPath = path.join(sampleZipPath, "emptyDir");
var emptyDirOutputPath = path.join(outputPath, "emptyDir");

describe("zip-dir", function () {
  describe("creates a zip buffer", function () {
    it("returns a usable zip buffer", function (done) {
      zipDir(sampleZipPath, function (err, buffer) {
        expect(err).to.not.be.ok;
        var zip = new Zip();
        zip.load(buffer);
        done();
      });
    });

    it("works with a trailing `/` in the path", function (done) {
      zipDir(path.join(sampleZipPath, path.sep), function (err, buffer) {
        expect(err).to.not.be.ok;
        var zip = new Zip();
        zip.load(buffer);
        done();
      });
    });

    it("returns an error when dirPath doesn\"t exist", function (done) {
      zipDir(xpiPath, function (err, buffer) {
        expect(err).to.be.ok;
        expect(buffer).to.not.be.ok;
        done();
      });
    });

    it("returns an error when dirPath is a file", function (done) {
      zipDir(path.join(sampleZipPath, "file1.json"), function (err, buffer) {
        expect(err).to.be.ok;
        expect(buffer).to.not.be.ok;
        done();
      });
    });
  });

  describe("writes a zip file", function () {
    beforeEach(function (done) {
      addEmpty(function () {
        zipAndUnzip(sampleZipPath, {saveTo: xpiPath}, done);
      });
    });
    afterEach(cleanUp);

    it("compresses and unpacks and all files match", function (done) {
      var files = [
        "file1.json",
        "tiny.gif",
        "dir/file2.json",
        "dir/file3.json",
        "dir/deepDir/deeperDir/file4.json"
      ];
      files.forEach(function(file){
        compareFiles(file, sampleZipPath);
      });
      done();
    });

    it("retains empty directories", function (done) {
      fs.stat(emptyDirOutputPath, function (err, stat) {
        expect(err).to.not.be.ok;
        expect(stat.isDirectory()).to.be.ok;
        done();
      });
    });
  });

  describe("uses `filter` to select items", function () {
    afterEach(cleanUp);

    it("filters out by file name, fs.Stat", function (done) {
      zipAndUnzip(sampleZipPath, {saveTo: xpiPath, filter: jsonOnly}, function () {
        var files = [
          "file1.json",
          "dir/file2.json",
          "dir/file3.json",
          "dir/deepDir/deeperDir/file4.json"
        ];
        files.forEach(function(file){
          compareFiles(file, sampleZipPath);
        });

        fs.stat(path.join(outputPath, "tiny.gif"), function (err, stat) {
          expect(err).to.be.ok;
          done();
        });
      });

      function jsonOnly(name, stat) {
        return /\.json$/.test(name) || stat.isDirectory();
      }
    });

    it("filtering out directories keeps it shallow", function (done) {
      zipAndUnzip(sampleZipPath, {saveTo: xpiPath, filter: noDirs}, function () {
        var files = [
          "file1.json",
          "tiny.gif"
        ];
        files.forEach(function(file){
          compareFiles(file, sampleZipPath);
        });

        fs.stat(path.join(outputPath, "dir"), function (err, stat) {
          expect(err).to.be.ok;
          done();
        });
      });

      function noDirs(name, stat) {
        return !stat.isDirectory();
      }
    });
  });

  describe("`each` option", function () {
    afterEach(cleanUp);

    it("calls `each` with each path added to zip", function (done) {
      var paths = [];

      function each(p) {
        paths.push(p);
      }

      zipDir(sampleZipPath, {each: each}, function (err, buffer) {
        var files = [
          "file1.json",
          "tiny.gif",
          "dir/",
          "dir/file2.json",
          "dir/file3.json",
          "dir/deepDir",
          "dir/deepDir/deeperDir",
          "dir/deepDir/deeperDir/file4.json"
        ].map(function (p) {
          return path.join.apply(path, [sampleZipPath].concat(p.split("/")));
        });

        files.forEach(function (p) {
          expect(paths.indexOf(p)).to.not.equal(-1);
          return p;
        });

        expect(paths.length).to.be.equal(files.length);
        done();
      });
    });

    it("calls `each`, ignoring unadded files", function (done) {
      var paths = [];

      function each(p) {
        paths.push(p);
      }

      function filter(p) {
        return /\.json$/.test(p) || fs.statSync(p).isDirectory();
      }

      zipDir(sampleZipPath, {each: each, filter: filter}, function (err, buffer) {
        var files = [
          "file1.json",
          "dir/file2.json",
          "dir/file3.json",
          "dir/",
          "dir/deepDir",
          "dir/deepDir/deeperDir",
          "dir/deepDir/deeperDir/file4.json"
        ].map(function (p) {
          return path.join.apply(path, [sampleZipPath].concat(p.split("/")));
        });

        files.forEach(function (p) {
          expect(paths.indexOf(p)).to.not.equal(-1);
          return p;
        });

        expect(paths.length).to.be.equal(files.length);
        done();
      });
    });
  });

  describe("`noEmptyDirectories` option", function () {
    afterEach(cleanUp);
    it("calls `noEmptyDirectories` with an empty root directory", function (done) {
      var ERROR_MSG = 'Cannot have an empty root directory';
      addEmpty(function() {
        zipDir(emptyDirPath, {noEmptyDirectories: true}, function (err, buffer) {
          expect(err).to.be.equal(ERROR_MSG);
          expect(buffer).to.be.a('null');
          done();
        });
      });
    });

    it("calls `noEmptyDirectories` with an empty sub directory", function (done) {
      this.timeout(3000);
       var files = [
          "file.txt"
        ];
        zipAndUnzip(emptySubFolderSampleZipPath, {saveTo: xpiPath, noEmptyDirectories: true}, function(){
          files.forEach(function(file){
            compareFiles(file, emptySubFolderSampleZipPath);
            done();
          });
        })
      });
    });
});

function compareFiles (file, inputPath) {
  var zipBuffer = fs.readFileSync(path.join(inputPath, file));
  var fileBuffer = fs.readFileSync(path.join(outputPath, file));
  expect(bufferEqual(zipBuffer, fileBuffer)).to.be.ok;
}

function zipAndUnzip (inputPath, options, done) {
  zipDir(inputPath, options, function (err, buffer) {
    if (err) throw err;
    fs.createReadStream(xpiPath)
      .pipe(unzip.Extract({ path: outputPath }))
      .on("close", done);
  });
}

function cleanUp (done) {
  fs.remove(outputPath, function () {
    fs.remove(xpiPath, function () {
      fs.remove(emptyDirPath, done);
    });
  });
}

// Adds an empty directory for testing
function addEmpty (done) {
  fs.mkdirp(emptyDirPath, done);
}
