echo "=== CRETON UPDATE ==="
echo "-> Stopping service ..."
sudo systemctl stop creton
echo "   Service stopped"
cd ..
echo "-> Deleting old backup"
rm -rf creton.backup
echo "   Done"
echo "-> Creating backup of current version"
cp -r creton creton.backup
echo "   Backup completed as creton.backup"
echo "-> Copying new files"
cp -r Creton-0.1/* creton
echo "   Copy completed"
echo "-> Cleaning up ..."
rm -rf Creton-0.1
echo "   All clean"
echo "-> Recompiling dependencies for current architecture"
cd creton
npm uninstall serialport && npm uninstall jsxapi
npm install serialport && npm install jsxapi
echo "   Compilation completed"
cd ..
echo "-> Starting service"
sudo systemctl start creton
echo "   Service started"

