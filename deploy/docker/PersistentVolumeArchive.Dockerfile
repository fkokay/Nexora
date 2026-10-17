FROM alpine:3.22
COPY deploy/docker/PersistentVolumeArchive.sh /usr/local/bin/persistent-volume-archive
ENTRYPOINT ["/bin/sh", "/usr/local/bin/persistent-volume-archive"]
