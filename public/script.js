let token = localStorage.getItem('token');
let last_tweet_timestamp;
let enabled_languages = [];

const socket = io();


if(!token){
    showLogin();
}else{
    socket.emit('login', token);
}
function showLogin() {
    Swal.mixin({
        input: 'text',
        showCancelButton: false,
        allowOutsideClick: false
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
socket.on('login', (_token, languages) => {
    if(_token){
        token = _token;
        enabled_languages = languages;
        changeLanguages(enabled_languages)
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

$('#de').on('click', () => toggleLanguage('de'))
$('#en').on('click', () => toggleLanguage('en'))
$('#in').on('click', () => toggleLanguage('in'))
$('#an').on('click', () => toggleLanguage('an'))

function toggleLanguage(language_to_toggle){
    let adjective = ''
    switch (language_to_toggle) {
        case 'de':
            adjective = 'german'
            break;
        case 'en':
            adjective = 'english'
            break;
        case 'in':
            adjective = 'not identifiable (e.g. images without text) '
            break;
        case 'an':
            adjective = 'ALL recorded'
            break;

    }
    if(!enabled_languages || !enabled_languages.includes(language_to_toggle)){
        Swal.fire({
            type: 'question',
            title: 'Enable language',
            text: 'Are you sure you want to include ' + adjective + ' tweets?',
            showCancelButton: true,
            confirmButtonText: 'Yes',
            cancelButtonText: 'No'
        })
        .then((result) => {
            if(!result.value) return
            if(!enabled_languages) enabled_languages = []
            enabled_languages.push(language_to_toggle)
            socket.emit('change_languages', token, enabled_languages)
        })
    }else{
        Swal.fire({
            type: 'question',
            title: 'Enable language',
            text: 'Are you sure you do not want to include ' + adjective + ' tweets?',
            showCancelButton: true,
            confirmButtonText: 'Yes',
            cancelButtonText: 'No'
        })
        .then((result) => {
            if(!result.value) return
            const i = enabled_languages.indexOf(language_to_toggle);
            if(i > -1)
                enabled_languages.splice(i, 1)
            socket.emit('change_languages', token, enabled_languages)
        })
    }
}

socket.on('change_languages', languages => changeLanguages(languages))

function changeLanguages(languages) {
    for(const e of document.querySelectorAll('.language_button')){
        e.classList.add('btn-danger')
        e.classList.remove('btn-success')
    }
    for(const lang of languages){
        $('#' + lang).toggleClass('btn-danger btn-success')
    }
}

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
        if(result.value)
            fireAddKeyword();
        else if (result.dismiss === "cancel")
            fireRemoveKeyword();

    })
})
socket.on('no_tweets', () => {
    Swal.fire({
        title: 'No tweets found',
        type: 'error',
        text: 'There are no tweets matching your query',
        confirmButtonText: 'Ok',
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
    saveAs(blob, filename + '.csv')
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
    saveAs(blob, filename + '.txt')
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
    saveAs(blob, filename + '.json')
}
