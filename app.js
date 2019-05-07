var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = '959f2e87abe940319839a08aa08adbd4'; // Your client id
var client_secret = 'c0b7b72a7274442cb3d8ad563fd19e7a'; // Your secret

const base = process.env.HEROKU_APP_NAME || null;
if (base === null) {
	var redirect_uri = 'http://localhost:8888/callback';
} else {
	var redirect_uri = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com/callback`;
}
console.log(redirect_uri);

var url = require('url');
const { createCanvas, loadImage, Image } = require('canvas');
var Request = require('pixl-request');

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
        console.log(body);
		res.redirect('/dashboard?' +
			querystring.stringify({
				token: access_token,
				user:  body.id
			}));
        });
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/dashboard', function(req, res, body) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	const access_token = req.query.token;
	const user_id = req.query.user;
	res.write('This is the dashboard!<br/>');
	res.write("You are: "+user_id+"<br/>");
	// request playlists
	var options = {
          url: `https://api.spotify.com/v1/users/${user_id}/playlists`,
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };
	request.get(options, function(error, response, body) {
		console.log(body);
		body.items.forEach(function(item) {
			res.write('<a href="/generate?'+
			querystring.stringify({
				token: access_token,
				user: user_id,
				playlist_id: item.id,
				playlist_name: item.name
			})+'" >');
			res.write(item.name+"<br/>");
			var img_url = item.images[0].url;
			res.write('<img width="100px" height="100px" src="'+
						img_url+'" /><br/>');
			//res.write(item.href+"<br/>");
			res.write(item.tracks.total+" tracks<br/>");
			//res.write(item.tracks.href+"<br/>");
			res.write("</a>-----<br/>");
		});
		res.end("");
	});
});

var is_clear = function(x,y,w,h,grid) {
	for (x_=x; x_<x+w; x_++) {
		for (y_=y; y_<y+h; y_++) {
			if (x_ >= grid[0].length) {
				return false;
			}
			if (y_ >= grid.length) {
				return false;
			}
			if (grid[y_][x_] !== false) {
				return false;
			};
		};
	};
	return true;
};

var fill_cells = function(x,y,w,h,g) {
	for (x_=x; x_<x+w; x_++) {
		for (y_=y; y_<y+h; y_++) {
			g[y_][x_] = true;
		};
	};
	return g;
};

var fit_vals = function(url_freq,unitW,unitH,w,h) {//
	const canvas = createCanvas(w,h);//
	const ctx = canvas.getContext('2d');
	//generate grid
	var grid = [];
	for (i=0; i<unitH; i++) {
		var row = []
		for(j=0; j<unitW; j++) {
			row.push(false);
		};
		grid.push(row);
	};
	
	var check = function(g) {
		for (row of grid) {
			for (cell of row) {
				if (cell == false) {
					return true;
				};
			};
		};
		return false;
	};
	var imgs = [];
	while (check(grid)) {
		for (const [url,freq] of Object.entries(url_freq)) {
			var sq_side = parseInt(Math.sqrt(freq));
			var fitted = false;
			while ((fitted === false) && (sq_side > 0)) {
				// iterate through positions
				for (Y=0; Y < grid.length; Y++) {
					for (X=0; X < grid[0].length; X++) {
						if (is_clear(X,Y,sq_side,sq_side,grid) === true) {
							grid = fill_cells(X,Y,sq_side,sq_side,grid);
							imgs.push([url,X*640,Y*640,640*sq_side,640*sq_side])
							url_freq[url] = url_freq[url] - (sq_side*sq_side);
							fitted = true;
							break;
						};
					};
					if (fitted === true) {
						break;
					};
				};
				if (fitted === false) {
					sq_side = sq_side - 1;
				};
			};
		};
	};
	// draw all these imgs
	var getImg = function(url) {
		return new Promise(resolve => {
			var request = new Request();
			request.get(url, function(err, resp, data) {
				if (err) throw err;
				
				var img = new Image();
				img.src = data;				
				resolve(img);
			});
		}); // end of promise
	};
	// build up promises of requests
	var promises = [];
	for ([url,x,y,w,h] of imgs) {
		promises.push(getImg(url));
	};
	return new Promise(resolve => {
		// wait for all to resolve
		Promise.all(promises).then(img_objects => {
			for (i=0; i<img_objects.length; i++) {
				var im = img_objects[i];
				x = imgs[i][1]; y = imgs[i][2];
				w = imgs[i][3]; h = imgs[i][4];
				ctx.drawImage(im,x,y,w,h);
			};
			resolve(canvas);
		});
	}); // end of top level promise
};

var get_tracks = function(entry_point,token) {
	console.log("REQUESTING",entry_point);
	return new Promise(resolve => {
			var options = {
			  url: entry_point,
			  headers: { 'Authorization': 'Bearer ' + token },
			  json: true
			};
			request.get(options, function(err, resp, body) {
				console.log("NEXT",body.next);
				if (err) throw err;
				var items = body.items;
				if (body.next !== null) {
					get_tracks(body.next,token).then( moretracks => {
						resolve(items.concat(moretracks));
					});
				} else {
					resolve(items);
				};
			});
		}); // end of promise
};

app.get('/generate', function(req, res, body) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	const access_token = req.query.token;
	const user_id = req.query.user;
	const playlist_id = req.query.playlist_id;
	const playlist_name = req.query.playlist_name;
	res.write('This is the cover generator page<br/>');
	res.write("You are: "+user_id+"<br/>");
	res.write("You selected: "+playlist_id+"<br/>");
	res.write("Name: "+playlist_name+"<br/>");
	
	get_tracks(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, access_token).then(items => {
		console.log(`FOUND ${items.length} tracks`);
		// create url, freq dictionary //
		var url_freq = {}
		var imgcount = 0;
		items.forEach(function (item) {
			// get the image
			const image_url = item.track.album.images[0].url
			if (url_freq[image_url] == null) {
				url_freq[image_url] = 1;
			} else {
				url_freq[image_url]++;
			};
			imgcount++;
		});
		
		// process tracks
		const sq_side = parseInt(Math.sqrt(imgcount));
		const w = sq_side * 640;
		const h = sq_side * 640;
		
		fit_vals(url_freq,sq_side,sq_side,w,h).then(im => {
			var imdata = im.toDataURL("image/jpeg");
			res.write('<img src="' + imdata + '" />')
			console.log("finished");
			res.end("<br/>END<br/>");
		});
	});
});

const port = process.env.PORT || 8888;
console.log('Listening on',port);
app.listen(port);
