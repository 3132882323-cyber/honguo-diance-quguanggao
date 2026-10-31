require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'HongguoSource'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Apache-2.0', :file => '../LICENSE' }
  s.author = 'Diance contributors; upstream OpenHongguo by beilunyang'
  s.homepage = 'https://github.com/beilunyang/openhongguo'
  s.source = { :git => 'https://github.com/beilunyang/openhongguo.git' }
  s.platforms = { :ios => '15.1' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  # This artifact is built locally from the vendored Go source, never downloaded.
  s.vendored_frameworks = 'HongguoCore.xcframework'
end
