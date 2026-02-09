----------------------------------

serv.py is the basic server script

Backend soll ein öffentlicher fastAPI server sein, der gesendeten Dateien erstmal lokal speichert

oder auf command zu .mcool umwandelt

oder auf command den Dockerserver startet

... 

------------dev locally - depreciated
run by going:

 uvicorn serv:app --reload in the Backend folder (Docker Desktop needs to be started)

---------------------- depreciated The following commands are all done in HiGlassServer.py -- Docker Desktop needs to be open
Docker backend uses .mcool file to create a higlass server that can be used be the frontend


#pull higlass docker image
docker pull higlass/higlass

#run the container
docker run -d ^
  --name higlass ^
  -p 8989:80 ^
  -v C:\Stuff\BA\Backend\McoolOutput:/data ^
  higlass/higlass

#restart container if stopped

#upload file
docker cp C:\Stuff\BA\Backend\McoolOutput\finishedFile.mcool higlass:/tmp/file.mcool

#delete previous file with uuID
docker exec -it higlass python higlass-server/manage.py delete_tileset --uuid finishedfile

#ingest file with uuID
docker exec -it higlass python higlass-server/manage.py ingest_tileset --filename /tmp/file.mcool --filetype cooler --datatype matrix --uid finishedfile --name finishedFile


##upload and ingest in one?
docker exec -it higlass python higlass-server/manage.py ingest_tileset --filename /data/finishedFile.mcool --filetype cooler --datatype matrix --uid finishedfile --name finishedFile

------------------------
