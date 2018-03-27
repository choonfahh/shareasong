// GET id thru telegram_id
var fetchAction =  require('node-fetch');

var url = "https://data.avocado32.hasura-app.io/v1/query";

var requestOptions = {
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    }
};

var body = {
    "type": "select",
    "args": {
        "table": "bot_user",
        "columns": [
            "id",
            "telegram_id"
        ],
        "where": {
            "telegram_id": {
                "$eq": "123456"
            }
        }
    }
};

requestOptions.body = JSON.stringify(body);

fetchAction(url, requestOptions)
.then(function(response) {
	return response.json();
})
.then(function(result) {
	console.log(JSON.stringify(result));
})
.catch(function(error) {
	console.log('Request Failed:' + error);
});

// POST new bot_user entry

var fetchAction =  require('node-fetch');

var url = "https://data.avocado32.hasura-app.io/v1/query";

var requestOptions = {
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    }
};

var body = {
    "type": "insert",
    "args": {
        "table": "bot_user",
        "objects": [
            {
                "telegram_id": "123456",
                "first_name": "Fah",
                "last_name": "Fah",
                "date_joined": "2018-08-23",
                "last_interaction": "2018-08-23",
                "last_active": "2018-08-23"
            }
        ],
        "returning": [
            "id"
        ]
    }
};

requestOptions.body = JSON.stringify(body);

fetchAction(url, requestOptions)
.then(function(response) {
	return response.json();
})
.then(function(result) {
	console.log(JSON.stringify(result));
})
.catch(function(error) {
	console.log('Request Failed:' + error);
});

// GET request to be delivered
var fetchAction =  require('node-fetch');

var url = "https://data.avocado32.hasura-app.io/v1/query";

var requestOptions = {
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    }
};

var body = {
    "type": "select",
    "args": {
        "table": "request",
        "columns": [
            "id",
            "content",
            {
                "name": "request_user",
                "columns": [
                    "telegram_id",
                    "first_name",
                    "last_name"
                ]
            }
        ]
    }
};

requestOptions.body = JSON.stringify(body);

fetchAction(url, requestOptions)
.then(function(response) {
	return response.json();
})
.then(function(result) {
	console.log(JSON.stringify(result));
})
.catch(function(error) {
	console.log('Request Failed:' + error);
});

//UPDATE request delivery count
var fetchAction =  require('node-fetch');

var url = "https://data.avocado32.hasura-app.io/v1/query";

var requestOptions = {
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    }
};

var body = {
    "type": "update",
    "args": {
        "table": "request",
        "where": {
            "id": {
                "$eq": "1"
            }
        },
        "$inc": {
            "delivered": "1"
        }
    }
};

requestOptions.body = JSON.stringify(body);

fetchAction(url, requestOptions)
.then(function(response) {
	return response.json();
})
.then(function(result) {
	console.log(JSON.stringify(result));
})
.catch(function(error) {
	console.log('Request Failed:' + error);
});

// GET request_id thru content for recommendation input
var fetchAction =  require('node-fetch');

var url = "https://data.avocado32.hasura-app.io/v1/query";

var requestOptions = {
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    }
};

var body = {
    "type": "select",
    "args": {
        "table": "request",
        "columns": [
            "id"
        ],
        "where": {
            "content": {
                "$eq": ""
            }
        }
    }
};

requestOptions.body = JSON.stringify(body);

fetchAction(url, requestOptions)
.then(function(response) {
	return response.json();
})
.then(function(result) {
	console.log(JSON.stringify(result));
})
.catch(function(error) {
	console.log('Request Failed:' + error);
});
