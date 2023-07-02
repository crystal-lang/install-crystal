require "spec"
require "yaml"

it "yaml" do
  any = YAML::Any.new({
    YAML::Any.new("foo") => YAML::Any.new(12_i64)
  })
  YAML.parse(any.to_yaml).should eq any
end

require "xml"

it "xml" do
  string = XML.build do |xml|
    xml.element("person", id: 1) do
      xml.element("firstname") { xml.text "Jane" }
      xml.element("lastname") { xml.text "Doe" }
    end
  end

  document = XML.parse(string)
  person = document.first_element_child.should_not be_nil
  person["id"].should eq "1"

  props = {} of String => String
  person.children.select(&.element?).each do |child|
    props[child.name] = child.content
  end
  props.should eq({
    "firstname" => "Jane",
    "lastname" => "Doe",
  })
end

require "big"

it "big" do
  1.to_big_d.to_i.should eq 1
end

require "openssl/sha1"

it "openssl" do
  OpenSSL::SHA1.hash("foobarbaz").should eq StaticArray[95, 85, 19, 248, 130, 47, 219, 229, 20, 90, 243, 59, 100, 216, 217, 112, 220, 249, 92, 110]
end
