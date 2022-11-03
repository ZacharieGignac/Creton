# Creton
Contrôler des appareils rs232 avec un appareil de la série ROOM KIT de Cisco!

## Software
Testé sur node v12.22.9

## Hardware
Testé sur Raspberry Pi 4 (raspbian 11 bullseye)

Testé sur Ubuntu 22.04 LTS

Testé avec les adaptateurs série-USB Startech (avec le contrôleur TexasIntrument ou Prolific)

## Dépendances / Recompilation
Les modules ne sont peut-être pas compilés avec la même architecture que votre système, donc il est préférable de les retirer et de les ajouter à nouveau:
```
npm uninstall serialport && npm uninstall jsxapi
npm install serialport && npm install jsxapi
```

## Installation
* Télécharger la dernière release (zip) et l'extraire.
* Dans le dossier extrait, copier le fichier install.sh dans le dossier supérieur
* Rendre le fichier executable (chmod +x)
* Executer l'installation ./install.sh


## Support expérimental pour les drivers d'affichage de la compagnie qui ressemble à "Creton"
Non documenté pour l'instant. Voir le code et les fichiers .json pour reverse-engineering

# Fichier de configuration config.js
À créer à partir du modèle config.js.example
## Section Codec
Informations de connexion au codec
```JS
    codec: {
        auth: {
            username: 'codecusername',            //Nom d'utilisateur sur le codec (créer en tant qu'admin)
            password: 'codecpassword'             //Mot de passe
        },
        info: {
            ip: '1.1.1.1',                        //Adresse IP du codec, peut aussi être un nom d'hôte
            maxConnectionAttempts: 10,            //Nombre de tentatives de reconnexions avant de quitter avec le statut 112
            reconnectInterval:15000,              //Délais entre chaque tentative de reconnexion (ms)
            serialNumber: 'SerialNumberHere',     //Numéro de série à inscrire dans les périphériques
            name: 'Creton'                        //Nom du périphérique ("webexroomssh" sera le ID peu importe le nom inscrit ici)
        }
    }
```
## Section Télémétrie
Informations de connexion au serveur de télémétrie MQTT
```JS
    telemetry: {
        enabled:true,                             //Active ou désactive la télémétrie
        broker: 'mqtt broker host/ip',            //IP ou HOST du broker MQTT (testé avec EMQX et MOSQUITTO)
        cliendId: 'clientid',                     //Client ID mqtt
        username: 'telemetryusername',            //Nom d'utilisateur MQTT
        password: 'telemetrypassword',            //Mot de passe MQTT
        basepath: 'systems/systemname'            //Chemin de base de ce système. Aucune données ne seront écrite en dehors de ce chemin
    }
```
## Section Ports série
Informations de connexion aux ports série
```JS
serialPorts: [
    {
        name:'moniteur',                                      //Nom du port série. Ce nom est utilisé ailleurs dans la configuration
        device:'/dev/serial/by-id/premier_adaptateur-port0',  //Chemin du port série. Voir dossier /dev/serial/by-id/
        baudRate:9600,                                        //BaudRate, la plupart des appareils AV utilisent 9600
        parity:'none',                                        //Parité, none, even, odd: none par défaut
        stopBits:1,                                           //stopBits: 1 par défaut
        dataBits:8,                                           //dataBits: 8 par défaut
        flowControl:false,                                    //controle de flow: false par défaut
        delimiter:'\r',                                       //Délimiteur utilisé pour la lecture sur le port série
        read:false                                            //Lecture du port série
    },
    {
        name:'projecteur',
        device:'/dev/serial/by-id/deuxieme_adaptateur-port0',
        baudRate:9600,
        delimiter:'\r',
        read:true
    }
]
```
## Section Triggers
Liste des déclancheurs, qui seront comparés avec les messages reçus du codec, xapi.command.message.send({text:'MON_TEXTE'})
```JS
triggers:[
    {
        id:'tv_power_on',                   //ID pour ce déclancheur
        text:'TV_POWER_ON',                 //Texte à matcher provenant du codec (xapi.command.message.send)
        serialPort:'moniteur',              //Nom du port série à utiliser
        raw:'ka 01 01\r',                   //Commande brute à envoyer au port série
        repeat:5000,                        //Répéter la commande à chaque ?ms. Si ce paramètre n'est pas présent, la commande n'est pas répétée
        telemetrypath:'/dev/monitor/power', //Chemin de la télémétrie (topic)
        telemetryvalue:'1',                 //Value de la télémétrie (payload)
        cancel:'tv_power_off',              //Annule la répétition d'un autre trigger
    },
    {
        id:'tv_power_off',
        text:'TV_POWER_OFF',
        serialPort:'moniteur',
        raw:'ka 01 00\r',
        repeat:5000,
        cancel:'tv_power_on',
        onStart:true,                       //Active ce trigger dès le démarrage de Creton
        telemetrypath:'/dev/monitor/power',
        telemetryvalue:'0'
    },
    {
        id:'DemandeLampe',
        text:'PROJ_LAMP_QUERY',
        serialPort:'projecteur',
        raw:'LAMP?\r',
        repeat:'66000',
        onStart:true
    }
]
```
## Section SerialParsing
Découpage et identification des données provenant des ports série, envoi de la télémétrie
```JS
serialParsing: [
    {
        id:'LireLampe',               //ID unique de ce parser
        serialPort:'projecteur',      //Nom du port série à lire
        match:data => {               //Vérifie si le message match "LAMP" et retourne le nombre d'heure de lampe. Si aucun match, retourne *undefined*.
            var data = data.toString().replace(/:/g,'');
            if (data.substring(0,4) == 'LAMP') {
                return data.substring(5);
            }
        },
        telemetrypath:'/dev/projector/lamphours' //Chemin de la télémétrie ou envoyer le retour de "match"
    },
    {
      id:'dataVersTelemetrie', //Ce trigger envoie toute les données reçues du port série vers la télémétrie
      serialPort:'projecteur',
      match:true,
      telemetrypath:'/dev/projector/serialdata'
    },
    {
        id: 'fake-Lampe',       //ID unique
        serialPort:'fake-lh',   //Tout port série commençant par "fake-" est virtuel. Il ne sert qu'à construire et tester un trigger
        fakeData:':LAMP=3000',  //Ce texte sera testé chaque 5 secondes
        match:data => { if(data.substring(0,5) == ':LAMP') { return data.substring(6); } },
        telemetrypath:'/dev/projector/lamphours',   //telemetry path. Added to "basepath"
    }
]
```
