package core

import (
	"bytes"
	"fmt"

	"github.com/Eyevinn/mp4ff/bits"
	"github.com/Eyevinn/mp4ff/mp4"
)

// decryptMP4 accepts standard CENC samples, not service-specific container
// variants. The caller has already obtained the key from its playback model.
func decryptMP4(raw, key []byte) (clear []byte, err error) {
	defer func() {
		if recover() != nil {
			clear = nil
			err = errUnsupportedMedia
		}
	}()
	if len(key) != 16 || len(raw) > maxMediaBytes {
		return nil, errUnsupportedMedia
	}
	file, err := mp4.DecodeFileSR(bits.NewFixedSliceReader(raw))
	if err != nil || file.Moov == nil {
		return nil, errUnsupportedMedia
	}
	output := bytes.NewBuffer(make([]byte, 0, len(raw)))
	if file.IsFragmented() {
		if file.Init == nil {
			return nil, errUnsupportedMedia
		}
		info, err := mp4.DecryptInit(file.Init)
		if err != nil {
			return nil, err
		}
		protected := false
		for _, track := range info.TrackInfos {
			if track.Sinf != nil {
				protected = true
				if track.Sinf.Schm == nil || track.Sinf.Schm.SchemeType != "cenc" {
					return nil, errUnsupportedMedia
				}
			}
		}
		if !protected || len(file.Segments) == 0 {
			return nil, errUnsupportedMedia
		}
		if err := file.Init.Encode(output); err != nil {
			return nil, err
		}
		for _, segment := range file.Segments {
			if err := mp4.DecryptSegment(segment, info, key); err != nil {
				return nil, err
			}
			if err := segment.Encode(output); err != nil {
				return nil, err
			}
			if output.Len() > maxMediaBytes {
				return nil, errMediaTooLarge
			}
		}
	} else {
		if err := decryptProgressive(file, key); err != nil {
			return nil, err
		}
		if err := file.Encode(output); err != nil {
			return nil, err
		}
		// Encryption metadata becomes equal-size free boxes, so stco/co64 offsets
		// remain correct whether the original moov preceded or followed mdat.
		if output.Len() != len(raw) {
			return nil, errUnsupportedMedia
		}
	}
	return output.Bytes(), nil
}

func decryptProgressive(file *mp4.File, key []byte) error {
	if file.Mdat == nil || file.Moov == nil {
		return errUnsupportedMedia
	}
	base := file.Mdat.StartPos + file.Mdat.HeaderSize()
	encryptedTracks := 0
	for _, track := range file.Moov.Traks {
		if track.Mdia == nil || track.Mdia.Minf == nil || track.Mdia.Minf.Stbl == nil {
			return errUnsupportedMedia
		}
		if err := track.CheckDataIsSelfContained(); err != nil {
			return errUnsupportedMedia
		}
		table := track.Mdia.Minf.Stbl
		if table.Stsd == nil {
			return errUnsupportedMedia
		}
		var sinf *mp4.SinfBox
		for _, entry := range table.Stsd.Children {
			switch box := entry.(type) {
			case *mp4.VisualSampleEntryBox:
				if box.Type() == "encv" {
					removed, err := box.RemoveEncryption()
					if err != nil {
						return err
					}
					sinf = removed
					box.AddChild(mp4.NewFreeBox(make([]byte, int(removed.Size())-8)))
				}
			case *mp4.AudioSampleEntryBox:
				if box.Type() == "enca" {
					removed, err := box.RemoveEncryption()
					if err != nil {
						return err
					}
					sinf = removed
					box.AddChild(mp4.NewFreeBox(make([]byte, int(removed.Size())-8)))
				}
			}
		}
		if sinf == nil {
			continue
		}
		encryptedTracks++
		if len(table.Stsd.Children) != 1 || sinf.Schm == nil || sinf.Schm.SchemeType != "cenc" || sinf.Schi == nil || sinf.Schi.Tenc == nil || table.Stsz == nil || table.Sgpd != nil {
			return errUnsupportedMedia
		}
		tenc := sinf.Schi.Tenc
		if tenc.DefaultIsProtected != 1 || (tenc.DefaultPerSampleIVSize != 8 && tenc.DefaultPerSampleIVSize != 16) {
			return errUnsupportedMedia
		}
		var senc *mp4.SencBox
		for _, box := range table.Children {
			if found, ok := box.(*mp4.SencBox); ok {
				senc = found
			}
		}
		if senc == nil || senc.SampleCount != table.Stsz.GetNrSamples() {
			return errUnsupportedMedia
		}
		if senc.ReadButNotParsed() || senc.IsParsedByGuess() {
			if err := senc.ParseReadBox(tenc.DefaultPerSampleIVSize, table.Saiz); err != nil {
				return err
			}
		}
		if len(senc.IVs) != int(senc.SampleCount) || (len(senc.SubSamples) != 0 && len(senc.SubSamples) != int(senc.SampleCount)) {
			return errUnsupportedMedia
		}
		for index := uint32(0); index < senc.SampleCount; index++ {
			ranges, err := track.GetRangesForSampleInterval(index+1, index+1)
			if err != nil || len(ranges) != 1 {
				return errUnsupportedMedia
			}
			location := ranges[0]
			if location.Offset < base || location.Offset-base > uint64(len(file.Mdat.Data)) || location.Size > uint64(len(file.Mdat.Data))-(location.Offset-base) {
				return errUnsupportedMedia
			}
			start := location.Offset - base
			iv := make([]byte, 16)
			if len(senc.IVs[index]) != 8 && len(senc.IVs[index]) != 16 {
				return errUnsupportedMedia
			}
			copy(iv, senc.IVs[index])
			var patterns []mp4.SubSamplePattern
			if len(senc.SubSamples) != 0 {
				patterns = senc.SubSamples[index]
			}
			if err := mp4.CryptSampleCenc(file.Mdat.Data[start:start+location.Size], key, iv, patterns); err != nil {
				return err
			}
		}
		for i, box := range table.Children {
			switch box.Type() {
			case "senc", "saiz", "saio":
				table.Children[i] = mp4.NewFreeBox(make([]byte, int(box.Size())-8))
			}
		}
		table.Saiz = nil
		table.Saio = nil
	}
	if encryptedTracks == 0 {
		return fmt.Errorf("no supported encrypted tracks")
	}
	return nil
}
