import { View, Text, SafeAreaView, StyleSheet, Button, Dimensions, Pressable, ActivityIndicator, FlatList } from 'react-native'
import { useCameraDevice, useCameraPermission, Camera } from 'react-native-vision-camera'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useImage, Image, CornerPathEffect } from "@shopify/react-native-skia";
import { Skia } from "@shopify/react-native-skia";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import { Canvas, Path, useCanvasRef, Picture } from "@shopify/react-native-skia";
import { Extrapolation, FadeIn, FadeOut, interpolate, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { SFSymbol } from 'react-native-sfsymbols';
import Config from 'react-native-config';
import Animated from 'react-native-reanimated';

import auth from '@react-native-firebase/auth';
import database from "@react-native-firebase/database"
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'

const screenHeight = Dimensions.get("screen").height;
const screenWidth = Dimensions.get("screen").width;

import Svg, { Circle } from "react-native-svg"
import { launchImageLibrary } from 'react-native-image-picker';

import RNFS from 'react-native-fs'

export default function CameraPage({ language, translations }) {
  Animated.addWhitelistedNativeProps({
    zoom: true,
  })
  const ReanimatedCamera = Animated.createAnimatedComponent(Camera)

  const device = useCameraDevice('back')
  const zoom = useSharedValue(device.neutralZoom)
  const zoomOffset = useSharedValue(0);

  const gesture = Gesture.Pinch()
    .onBegin(() => {
      console.log("wooow")
      zoomOffset.value = zoom.value
    })
    .onUpdate(event => {
      const z = zoomOffset.value * event.scale
      zoom.value = interpolate(
        z,
        [1, 10],
        [device.minZoom, device.maxZoom],
        Extrapolation.CLAMP,
      )
    })


  const animatedProps = useAnimatedProps(
    () => ({ zoom: zoom.value }),
    [zoom]
  )

  const [words, setWords] = useState([])

  async function getWords() {
    let uid = auth().currentUser.uid;
    database()
      .ref(`${uid}/words`)
      .once('value')
      .then(snapshot => {
        let data = snapshot.val()

        let words = []
        for (const word in data) {
          // console.log(data[word])
          let obj = data[word]
          obj.word = word
          words.push(obj)
        }
        setWords(words)
        // console.log(words)
      })
  }

  useEffect(() => {
    getWords()
  }, [])


  const genAI = new GoogleGenerativeAI(Config.API_KEY);
  const [originalWord, setOriginalWord] = useState(null)
  const [originalDefinition, setOriginalDefinition] = useState(null)
  const [translatedWord, setTranslatedWord] = useState(null)
  const [translatedDefinition, setTranslatedDefinition] = useState(null)
  const [loading, setLoading] = useState(false)

  const safetySetting = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySetting, generationConfig: { responseMimeType: "application/json" } },);

  const addWord = (originalWord, originalDefinition, translatedWord, translatedDefinition) => {
    const uid = auth().currentUser.uid;
    database()
      .ref(`/${uid}/words`)
      .update({
        [originalWord]: {
          translatedWord: translatedWord,
          definition: originalDefinition,
          translatedDefinition: translatedDefinition,
          score: 0
        }
      })
      .then(() => console.log("Done!")).catch(error => {
        console.error("Failed to add word to database:", error);
      });
  }

  const bottomSheetRef = useRef(null)


  function openTextSheet() {
    bottomSheetRef.current.snapToIndex(0);
  }

  const define = async (imageData) => {

    // console.log(Config.API_KEY)

    const prompt = `
    Determine the root word of the highlighted word in the image (ex. leaving -> leave).
    Provide the word and definition in the original language of the word; additionally, provide the word and definition in ${language}. 
    Definitions should be 12 words or less. Everything must be lowercase.
    Use this JSON schema:
    { "originalWord": "string",
      "originalDefinition": "string", 
      "translatedWord": "string",
      "translatedDefinition": "string"
    }`

    const result = await model.generateContent([prompt, { inlineData: { data: imageData, mimeType: 'image/png' } }]);
    const response = result.response;
    const text = JSON.parse(response.text());
    // console.log(text)
    // console.log("response")
    setOriginalWord(text.originalWord)
    setOriginalDefinition(text.originalDefinition)
    setTranslatedWord(text.translatedWord)
    setTranslatedDefinition(text.translatedDefinition)
    addWord(text.originalWord, text.originalDefinition, text.translatedWord, text.translatedDefinition);
    openTextSheet();
    setLoading(false)

    // setResponse(JSON.stringify(text))
  }


  const [paths, setPaths] = useState([]);
  const canvasRef = useCanvasRef();


  const camera = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(true);
  const [image, setImage] = useState(null);
  const [loadedImage, setLoadedImage] = useState(null)
  const { hasPermission, requestPermission } = useCameraPermission()

  const [currentPosition, setCurrentPosition] = useState(-1)

  const [flash, setFlash] = useState('off')

  const saveMarkedUpImage = async () => {
    setLoading(true)
    const image = await canvasRef.current.makeImageSnapshotAsync();
    const bytes = image.encodeToBase64();
    // console.log(bytes)
    define(bytes)

  };

  // onBegin will allow only one stroke
  const pan = Gesture.Pan()
    .onStart((g) => {
      console.log("start")
      // const newPaths = [];
      const newPaths = [...paths]
      // console.log(newPaths)
      newPaths[paths.length] = {
        segments: [],
        color: "#77bee9",
      };
      newPaths[paths.length].segments.push(`M ${g.x} ${g.y}`);
      runOnJS(setPaths)(newPaths);
    })
    .onUpdate((g) => {
      const index = paths.length - 1;
      const newPaths = [...paths];
      if (newPaths?.[index]?.segments) {
        newPaths[index].segments.push(`L ${g.x} ${g.y}`);
        runOnJS(setPaths)(newPaths);
      }
    })
    .onEnd((g) => {
      console.log("Done")
    }
    )
    .minDistance(1)

  useEffect(() => {
    if (!hasPermission)
      requestPermission()
  }, [])


  useEffect(() => {
    if (image) {
      const data = Skia.Data.fromBase64(image);
      const newImage = Skia.Image.MakeImageFromEncoded(data);

      console.log(newImage)
      setLoadedImage(newImage)
      console.log("AAAA")
      setCameraOpen(false)
    }
  }, [image])


  
  if (hasPermission)
    return (
      <>
        <View style={{ backgroundColor: "black", flex: 1 }}>

          {!loadedImage ?
            <>
              <GestureHandlerRootView style={{ flex: 1, height: screenHeight, width: screenWidth}}>
                  <GestureDetector gesture={gesture} style={{ flex: 1, height: screenHeight, width: screenWidth}}>
                    <Camera
                ref={camera}
                style={{ width: screenWidth, height: screenHeight, position: "absolute" }}
                device={device}
                isActive={true}
                photo={true}
                    />
                    {/* <ReanimatedCamera
                ref={camera}
                style={{ width: screenWidth, height: screenHeight, position: "absolute" }}
                device={device}
                isActive={false}
                photo={true}
                zoom={zoom.value} /> */}

                  </GestureDetector>
              </GestureHandlerRootView>
              {/* <View style={{ flex: 1, }}>
                <Animated.View style={styles.buttonContainer} key="buttonContainer1" entering={FadeIn.duration(250).delay(250)} exiting={FadeOut.duration(500)}>
                  <Pressable style={{ ...styles.actionButton, }} onPress={() => {
                    if (flash == "on") setFlash("off")
                    else setFlash("on")
                  }}>
                    <SFSymbol name={flash == "on" ? "bolt.fill" : "bolt.slash.fill"} size={25} color="white" />
                  </Pressable>
                  <Pressable onPress={async () => {
                    const photo = await camera.current.takePhoto({
                      flash: flash
                    });
                    RNFS.readFile(photo.path, 'base64').then(result => {
                      setImage(result)
                    })
                  }}>
                    <Svg
                      width={80}
                      height={80}
                      viewBox="0 0 72 72"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <Circle cx={36} cy={36} r={30} fill="#F0E8DD" />
                      <Circle cx={36} cy={36} r={34.5} stroke="#F0E8DD" strokeWidth={3} />
                    </Svg>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => {
                    launchImageLibrary({ mediaType: "photo", includeBase64: true }, (result) => {
                      if (!result?.didCancel) {
                        let image = result.assets[0].base64
                        setImage(image)
                      }

                    })
                  }}>
                    <SFSymbol name="photo.on.rectangle.angled" size={25} color="white" />
                  </Pressable>
                </Animated.View>
              </View> */}
            </>
            : <>
              {/* entering={FadeIn.duration(500).delay(500)} */}
              <Animated.View style={styles.buttonContainer} key="buttonContainer2" exiting={FadeOut.duration(250)}>
                <Pressable style={{ ...styles.actionButton, }} onPress={() => {
                  setCameraOpen(true);
                  setImage(null);
                  setLoadedImage(null);
                }}>
                  <Animated.View>
                    <SFSymbol name="arrow.triangle.2.circlepath.camera.fill" size={24} color="white" />
                  </Animated.View>
                </Pressable>
                <Pressable onPress={() => {
                  if (!loading && paths.length) saveMarkedUpImage()
                }} style={styles.bigActionButton} opacity={paths.length ? 1 : 0.5}>
                  {!loading
                    ? <SFSymbol name="doc.text.magnifyingglass" size={32} color="black" />
                    : <ActivityIndicator />
                  }
                </Pressable>
                <Pressable style={{ ...styles.actionButton, }} onPress={() => { setPaths([]) }}>
                  <Animated.View>
                    <SFSymbol name="eraser.fill" size={25} color="white" />
                  </Animated.View>
                </Pressable>
              </Animated.View>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <GestureDetector gesture={pan}>
                  <View style={{ flex: 1, position: 'absolute', width: screenWidth, height: screenHeight }}>
                    <Canvas style={styles.canvas} ref={canvasRef}>
                      <Image image={loadedImage} fit="cover" x={0} y={0} width={screenWidth} height={screenHeight} />
                      {paths.map((p, index) => (
                        <Path
                          key={index}
                          path={p?.segments.join(" ") ? p.segments.join(" ") : " "}
                          strokeWidth={30}
                          style="stroke"
                          color={p?.color}
                          opacity={0.5}
                          strokeCap="round"
                        >
                          <CornerPathEffect r={600004} />
                        </Path>
                      ))}
                    </Canvas>

                    <View style={{ ...StyleSheet.absoluteFill, position: "absolute", zIndex: 100 }}>
                      <Text style={{ fontSize: 18, position: "absolute", top: screenHeight * 0.905, alignSelf: "center", color: "white", textShadowColor: 'rgba(0, 0, 0, 1)', textShadowRadius: 10, padding: 10 }}>{translations.highlight_text_to_translate[language]}.</Text>
                    </View>
                  </View>

                </GestureDetector>
              </GestureHandlerRootView>
            </>
          }
        </View>
        <BottomSheet
          ref={bottomSheetRef}
          snapPoints={["30%", "80%"]}
          index={-1}
          backgroundStyle={{ backgroundColor: "#F5EEE5" }}
          enablePanDownToClose={true}
          onChange={index => {
            setCurrentPosition(index)
          }}
        >
          <BottomSheetView style={styles.contentContainer}>
            <Text style={styles.title}>{translations.definitions[language]}</Text>
            <FlatList
              data={words}
              contentContainerStyle={{ gap: 10, paddingBottom: 30, alignSelf: "center" }}
              renderItem={({ item }) => {
                // console.log(item)
                return (<Term word={item.word} translatedWord={item.translatedWord} translatedDefinition={item.translatedDefinition} />)
              }}
              ListHeaderComponent={
                currentPosition !== -1 ?
                  <Animated.View key="lists" entering={FadeIn.duration(750)} style={{ ...styles.termContainer, alignSelf: "center", }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingBottom: 12, }}>
                      <Text style={styles.termTitle}>{originalWord}</Text>
                      <SFSymbol name="speaker.wave.2.fill" size={20} color="#77BEE9" />
                    </View>
                    <Text style={styles.termSubtitle}>{translatedWord} · {translatedDefinition}</Text>
                  </Animated.View>
                  : <View style={{ ...styles.termContainer, alignSelf: "center", opacity: 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingBottom: 12, }}>
                      <Text style={styles.termTitle}>{originalWord}</Text>
                      <SFSymbol name="speaker.wave.2.fill" size={20} color="#77BEE9" />
                    </View>
                    <Text style={styles.termSubtitle}>{translatedWord} · {translatedDefinition}</Text>
                  </View>
              }
              // scrollEnabled={false}
              style={{ paddingBottom: 50 }}
            />
          </BottomSheetView>
        </BottomSheet>
      </>

    )
}

function Term({ word, translatedWord, translatedDefinition }) {
  return (
    <View style={styles.termContainer}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingBottom: 12, }}>
        <Text style={styles.termTitle}>{word}</Text>
        <SFSymbol name="speaker.wave.2.fill" size={20} color="#77BEE9" />
      </View>
      <Text style={styles.termSubtitle}>{translatedWord} · {translatedDefinition}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  termContainer: {
    backgroundColor: "white",
    borderRadius: 26,
    padding: 20,
    width: screenWidth * 0.9,
    height: screenHeight * 0.16

  },
  termTitle: {
    fontFamily: "NewYorkLarge-Regular",
    fontSize: 20,
  },
  termSubtitle: {
    fontSize: 17,
    fontFamily: "SFPro-Regular"
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    fontFamily: "NewYorkLarge-Semibold",
    paddingTop: 10,
    paddingBottom: 20,
    paddingLeft: 30,

  },
  tabBar: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    position: "absolute",
    zIndex: 100,
    top: screenHeight * 0.07,
    justifyContent: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 35,
    borderRadius: 60,

    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 25,
    paddingRight: 25
  },
  drawingContainer: {
    flex: 1,
    position: 'relative',
  },
  backgroundContainer: {
    backgroundColor: "green",
    flex: 1,
    height: "100%"
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    resizeMode: 'contain',
    zIndex: 1,
  },
  canvas: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  languageText: {
    fontFamily: 'SFProRounded-Bold',
    color: "white",
    fontSize: 23,
  },
  actionButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2F2C2A",
    borderRadius: 25,
  },
  bigActionButton: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#77bee9",
    borderRadius: 40,
  },
  buttonContainer: {
    position: "absolute",
    top: screenHeight * 0.8,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    width: "100%",
    zIndex: 100000
  },
})

