let token = localStorage.getItem('token');
let last_tweet_timestamp;
const socket = io();


if(!token){
    showLogin();
}else{
    socket.emit('login', token);
}
function showLogin() {
    Swal.mixin({
        input: 'text',
        showCancelButton: true
    })
    .queue([
        {
            title: 'Username',
            text: 'please enter your username',
            confirmButtonText: 'Next &rarr;'
        },
        {
            input: 'password',
            title: 'Password',
            confirmButtonText: 'Login',
            text: 'please enter your password'
        },
    ])
    .then((result, username = result.value[0], password = result.value[1]) => {
        socket.emit('login', username, password);
    })
}
socket.on('login', (_token) => {
    if(_tokent){
        token = _token;
        localStorage.setItem('token', _token);
    }else{
        Swal.fire({
            type: 'error',
            title: 'Error',
            text: 'Wrong username or password',
            confirmButtonText: 'Try again'
        })
        .then(() => {
            showLogin();
        })
    }
})

$('#keys').on('click', () => {
    socket.emit('getKeys', token)
})
$('#logout').on('click', () => {
    localStorage.removeItem('token')
    showLogin();
})
$('#power').on('click', () => {
    socket.emit('stream', token)
})
$('#download').on('click', () => {
    socket.emit('download', token, $('#date_select').val(), $('#type_select').val())
})
socket.on('getKeys', (keys) => {
    let badges = ''
    if(keys)
        for(key of keys)
            badges += '<span class="badge badge-primary">' + key + '</span> '
    Swal.fire({
        title: 'Keywords',
        customClass: {
            confirmButton: 'btn btn-success mx-1',
            cancelButton: 'btn btn-danger mx-1'
          },
        buttonsStyling: false,
        type: '',
        html:
            'Aktuelle Tags:<br>' + badges,
        showCloseButton: true,
        showCancelButton: true,
        focusConfirm: false,
        confirmButtonText:
            '<i class="fa fa-plus"></i>',
        confirmButtonAriaLabel: 'Add tag',
        cancelButtonText:
            '<i class="fa fa-minus"></i>',
        cancelButtonAriaLabel: 'Thumbs down',
    })
    .then((result) => {
        console.log(result)
        if(result.value)
            fireAddKeyword();
        else if (result.dismiss === "cancel")
            fireRemoveKeyword();

    })
})

socket.on('tweet', (date) => {
    last_tweet_timestamp = date
})
socket.on('power_timestamp', (running, timestamp) => {
    const prefix = running ? '<i class="fas fa-power-off" style="color: green"></i> online since ' : '<i class="fas fa-power-off" style="color: red"></i> offline since '
    const minutes_ago = Math.ceil((Date.now() - timestamp) / (60000))
    const hours_ago = Math.floor((Date.now() - timestamp) / (60 * 60000))
    $('#power_timestamp').html( prefix + (hours_ago ? (hours_ago + 'h ') : '') + minutes_ago + 'm')
})

setInterval(() => {
    if(last_tweet_timestamp){
        const seconds_ago = Math.ceil((Date.now() - last_tweet_timestamp) / (1000)) % 60
        const minutes_ago = Math.floor((Date.now() - last_tweet_timestamp) / (60000))
        $('#last_tweet').html( (minutes_ago ? (minutes_ago + 'm ') : '') + seconds_ago + 's')
    }
}, 1000)

function fireAddKeyword(){
    Swal.fire({
        title: 'Add Keyword',
        confirmButtonText: '<i class="fas fa-plus"></i>',
        input: 'text',
        showCancelButton: true,
        customClass: {
            confirmButton: 'btn btn-success mx-1',
            cancelButton: 'btn btn-primary mx-1'
          },
        buttonsStyling: false,
    })
    .then((result, key = result.value) => {
        if(key){
            socket.emit('addKey', token, key)
        }
    })
}

function fireRemoveKeyword(){
    Swal.fire({
        title: 'Remove Keyword',
        confirmButtonText: '<i class="fas fa-minus"></i>',
        input: 'text',
        showCancelButton: true,
        customClass: {
            confirmButton: 'btn btn-danger mx-1',
            cancelButton: 'btn btn-primary mx-1'
          },
        buttonsStyling: false,
    })
    .then((result, key = result.value) => {
        if(key){
            socket.emit('delKey', token, key)
        }
    })
}

socket.on('download', (type, filename, rows) => {
    switch (type) {
        case 'csv':
            exportToCsv(filename, rows)
            break;
        case 'txt':
            exportToTxt(filename, rows)
            break;
        case 'json':
            exportToJson(filename, rows)
            break;

    }
})

function exportToCsv(filename, rows) {
    const processRow = function (row) {
        let finalVal = '';
        for (let j = 0; j < row.length; j++) {
            let innerValue = row[j] === null ? '' : row[j].toString();
            if (row[j] instanceof Date) {
                innerValue = row[j].toLocaleString();
            };
            let result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0)
                result = '"' + result + '"';
            if (j > 0)
                finalVal += ',';
            finalVal += result;
        }
        return finalVal + '\n';
    };

    let csvFile = '';
    for(const row of rows){
        csvFile += processRow(row)
    }

    const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function exportToTxt(filename, rows) {
    const filed_names = rows.shift();

    let file = ''
    for(const row of rows){
        for(const i in row){
            file += filed_names[i] + ': \n\t' + row[i] + '\n'
        }
        file += '\n\n'

    }

    const blob = new Blob([file], { type: 'text/txt;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename + '.txt');
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename + '.txt');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}
function exportToJson(filename, rows) {
    const filed_names = rows.shift();

    let file = '[\n'
    for(const j in rows){
        file += '\t{\n'
        for(const i in rows[j]){
            file += '\t\t"' + filed_names[i].toLowerCase() + '": "' + rows[j][i] + '"' + (parseInt(i) === rows[j].length - 1 ? '\n' : ',\n')
        }

        file += '\t}' + (parseInt(j) !== rows.length - 1 ? ',' : '') + '\n'
    }
    file += ']'

    const blob = new Blob([file], { type: 'text/json;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename + '.json');
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename + '.json');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}
