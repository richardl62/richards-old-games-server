var express = require('express');
var path = require('path');

var app = express();
app.use(express.static('public'));

app.get('/test', function (req, res) {

    console.log('__dirname', __dirname);
    var options = {
        root: path.join(__dirname, 'public'),
    }

    console.log('Root 1:', options.root);

    res.sendFile('test.html', options);
});

app.get('/', function (req, res) {
  res.send('Hello World!');
});


app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});