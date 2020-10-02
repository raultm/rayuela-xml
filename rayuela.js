'use strict';

var storageKey = "centro.sqlite"
var db

function removeDB()
{
    window.localStorage.removeItem(storageKey);
    db = null
}

function exportDB()
{
    // In localStorage save as binaryString, convert to Binary Array
    var arraybuff = toBinArray(window.localStorage.getItem(storageKey));
    var blob = new Blob([arraybuff]);
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.href = window.URL.createObjectURL(blob);
    a.download = "sql.db";
    a.onclick = function () {
        setTimeout(function () {
        window.URL.revokeObjectURL(a.href);
        }, 1500);
    };
    a.click();
}

function importDB()
{
    var fileInput = document.getElementById("dbfile")
    var f = fileInput.files[0];
    var r = new FileReader();
    var list = document.getElementById("list-avisos")
        list.innerHTML = "Cargando Datos"
        
	r.onload = function (event) {
        window.localStorage.removeItem(storageKey);
        // r.result is a Binary Array, convert to Binary String
        window.localStorage.setItem(storageKey, toBinString(r.result));
        db = null
        showTables()
    }
	r.readAsArrayBuffer(f);
}

function importXML()
{
    handleFileList(document.getElementById("xmlfile"), readXML)
}

function handleFileList(fileInput, fn)
{
    toArray(fileInput.files).forEach( readXML )
}

function toArray(fileList)
{
    return Array.from(fileList)
}

function readXML(file)
{   
    //console.log(file)
    var r = new FileReader();
    r.onload = function (event) {
        //console.log(toBinString(event.currentTarget.result))
        window.localStorage.removeItem(storageKey);
        try {
            processData(xmlString2JsonObject(toBinString(event.currentTarget.result)))
            showTables()
        }catch(error){
            console.log(event);
        }
    }
    r.readAsArrayBuffer(file)
}

function showTutores()
{
    var commands = document.getElementById('commands')
    commands.value = `SELECT grupos.nombre, profesores.usuario FROM grupos INNER JOIN profesores ON grupos.tutor = profesores.dni \n`
    runCommands()
}

function showTables()
{
    var results = execSql("SELECT `name`, `sql`\n  FROM `sqlite_master`\n  WHERE type='table';")
    var tablesDiv = document.getElementById("tables")
    var commands = document.getElementById('commands')
    tablesDiv.innerHTML = "";
    commands.value = ""
    results[0].values.forEach( row => {
        var tableName = row[0]
        tablesDiv.innerHTML+= `<button onclick="showTable('${tableName}')">${tableName}</button>`
        if(tableName != "sqlite_sequence"){
            commands.value+= `\n/* ${tableName} - 10 registros */\n`
            //commands.value+= `/*PRAGMA table_info(${tableName});*/\n`
            commands.value+= `SELECT * FROM ${tableName} LIMIT 10;\n`
        }else{
            commands.value = 
                   `\n/* Último índice creado en cada tabla */\n`
                +  `SELECT * FROM ${tableName};\n` + commands.value
        }
    })

    commands.value = `/* La versión de la base de datos */\nPRAGMA user_version; \n`  + commands.value
    
    runCommands()
}

function showTable(tableName)
{
    var commands = document.getElementById('commands')
    commands.value = `SELECT * FROM ${tableName};\n`
    runCommands()
}

function showVersion()
{
    var commands = document.getElementById('commands')
    commands.value = `PRAGMA user_version; /* For migrations purposes */ \n`
    runCommands()
}


var tableCreate = function () {
	function valconcat(vals, tagName) {
		if (vals.length === 0) return '';
		var open = '<' + tagName + '>', close = '</' + tagName + '>';
		return open + vals.join(close + open) + close;
	}
	return function (columns, values) {
        var tbl = document.createElement('table');
        tbl.border = "1px solid"
        tbl.style = "border-collapse: collapse"
		var html = '<thead>' + valconcat(columns, 'th') + '</thead>';
		var rows = values.map(function (v) { return valconcat(v, 'td'); });
		html += '<tbody>' + valconcat(rows, 'tr') + '</tbody>';
		tbl.innerHTML = html;
		return tbl;
	}
}();

function runCommands() {
    var commands = document.getElementById('commands')
    //console.log(commands.value)
    var results = execSql(commands.value + ';')
    output(results)
}

function xmlString2JsonObject(xmlString)
{
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(xmlString,"text/xml");
    var jsonString = xml2json(xmlDoc).replace("undefined", "")
    return JSON.parse(jsonString)
}

function processData(data)
{
    if(data.html) { console.log("No valido"); return; }

    if(data["profesorado-centro"]){ 
        //console.log("Profesorado") 
        execSql(`DELETE FROM profesores;`);
        data["profesorado-centro"].profesor.forEach(processProfesor)
    }
    if(data["alumnado-centro"]){ 
        //console.log("Alumnado") 
        execSql(`DELETE FROM alumnos;`);
        data["alumnado-centro"].alumno.forEach(processAlumno)
    }
    if(data["grupos-centro"]){ 
        //console.log("grupos") 
        execSql(`DELETE FROM cursos;`);
        execSql(`DELETE FROM grupos;`);
        data["grupos-centro"].curso.forEach(processCurso)
    }
}

function processProfesor(profesor)
{
    var p = propFromObject(profesor)
    return execSql(`INSERT INTO profesores(dni, nombre, primer_apellido, segundo_apellido, usuario, departamento) 
                    VALUES    (?,        ?,           ?,                   ?,                     ?,                                ?)`, 
                              [p("dni"), p("nombre"), p("primer-apellido"),p("segundo-apellido") ,p("datos-usuario-rayuela").login, p("departamento")]
    );
}

function processAlumno(alumno)
{
    var p = propFromObject(alumno)
    return execSql(`INSERT INTO alumnos(nie, nombre, primer_apellido, segundo_apellido,fecha_nacimiento, usuario, grupo) 
                    VALUES    (?,        ?,           ?,                   ?,                     ?,                    ?,                                ?)`, 
                              [p("nie"), p("nombre"), p("primer-apellido"),p("segundo-apellido"),p("fecha-nacimiento") ,p("datos-usuario-rayuela").login, p("grupo")]
    );
}

function processCurso(curso)
{
    var p = propFromObject(curso)
    var nombreCurso = p("nombre-curso")
    execSql(`INSERT INTO cursos(nombre) 
                    VALUES    (?)`, 
                              [nombreCurso]
    );
    var grupos = p("grupo-curso")
    if(grupos["nombre-grupo"]){
        grupos = [grupos]
    }
    grupos.forEach( grupo => {
        var p = propFromObject(grupo)
        execSql(`INSERT INTO grupos(curso, nombre, tutor) VALUES  (?,           ?,                 ?)`,
         [nombreCurso, p("nombre-grupo"), p("dni-tutor-grupo")])
    });
}


function propFromObject(object)
{
    return (prop) => object[prop] ? object[prop] : ""
}


function output(results)
{
    var outputElm = document.getElementById('output');
    outputElm.innerHTML = "";
    for (var i = 0; i < results.length; i++) {
        outputElm.appendChild(tableCreate(results[i].columns, results[i].values));
    }
}

function toBinArray(str) {
    var l = str.length,
        arr = new Uint8Array(l);
    for (var i = 0; i < l; i++) arr[i] = str.charCodeAt(i);
    return arr;
}

function toBinString(arr) {
    var uarr = new Uint8Array(arr);
    var strings = [], chunksize = 0xffff;
    // There is a maximum stack size. We cannot call String.fromCharCode with as many arguments as we want
    for (var i = 0; i * chunksize < uarr.length; i++) {
        strings.push(String.fromCharCode.apply(null, uarr.subarray(i * chunksize, (i + 1) * chunksize)));
    }
    return strings.join('');
}

function getDB()
{
    if(db){
        return db
    }
    var dbstr = window.localStorage.getItem(storageKey);
    
    if (dbstr) {
        db = new SQL.Database(toBinArray(dbstr));
    } else {
        db = new SQL.Database();
        db.run(`CREATE TABLE "profesores" (
            "id"	INTEGER,
            "dni"	INTEGER NOT NULL,
            "nombre"	TEXT NOT NULL,
            "primer_apellido"	TEXT ,
            "segundo_apellido"	TEXT ,
            "usuario"	TEXT NOT NULL,
            "departamento"	TEXT,
            "created_at"	TEXT DEFAULT (STRFTIME('%Y-%m-%d   %H:%M:%S', 'NOW','localtime')),
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);
        db.run(`CREATE TABLE "alumnos" (
            "id"	INTEGER,
            "nie"	TEXT NOT NULL,
            "nombre"	TEXT NOT NULL,
            "primer_apellido"	TEXT ,
            "segundo_apellido"	TEXT ,
            "fecha_nacimiento"	TEXT,
            "usuario"	TEXT,
            "grupo"	TEXT,
            "created_at"	TEXT DEFAULT (STRFTIME('%Y-%m-%d   %H:%M:%S', 'NOW','localtime')),
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);
        db.run(`CREATE TABLE "cursos" (
            "id"	INTEGER,
            "nombre"	TEXT NOT NULL,
            "created_at"	TEXT DEFAULT (STRFTIME('%Y-%m-%d   %H:%M:%S', 'NOW','localtime')),
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);
        db.run(`CREATE TABLE "grupos" (
            "id"	INTEGER,
            "curso" TEXT NOT NULL,
            "nombre"	TEXT NOT NULL,
            "tutor"	TEXT NOT NULL,
            "created_at"	TEXT DEFAULT (STRFTIME('%Y-%m-%d   %H:%M:%S', 'NOW','localtime')),
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);
    }
    return db
}

function execSql(sql, bindings)
{
    //console.time("exec: " + sql);
    try {
        if(bindings){
            //console.log(bindings)
            var contents = getDB().run(sql, bindings)
        }else{
            var contents = getDB().exec(sql);
        }
    } catch(err) {
        console.error(err.message);
    }
    
    //console.timeEnd("exec: " + sql);
    // Guardamos nuevo estado
    var dbstr = toBinString(db.export());
    window.localStorage.setItem(storageKey, dbstr);
    // Devolvemos resultado de la consulta
    return contents
}