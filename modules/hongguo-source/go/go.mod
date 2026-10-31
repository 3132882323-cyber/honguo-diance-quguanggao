module dev.diance.hongguo/core

go 1.26.0

require github.com/beilunyang/openhongguo v0.0.0

require github.com/Eyevinn/mp4ff v0.0.0

require (
	golang.org/x/mobile v0.0.0-20261011034528-197770444867 // indirect
	golang.org/x/mod v0.42.0 // indirect
	golang.org/x/sync v0.24.0 // indirect
	golang.org/x/tools v0.52.0 // indirect
)

replace github.com/beilunyang/openhongguo => ../../../third_party/openhongguo

replace github.com/Eyevinn/mp4ff => ../../../third_party/mp4ff

tool golang.org/x/mobile/cmd/gobind
