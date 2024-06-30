import { View, Text, SafeAreaView, StyleSheet, Button, Dimensions, Pressable, ActivityIndicator, FlatList } from 'react-native'
import { Configuration, PESDK, Tool } from "react-native-photoeditorsdk";
import { useCameraDevice, useCameraPermission, Camera } from 'react-native-vision-camera'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useImage, Image } from "@shopify/react-native-skia";
import { Skia } from "@shopify/react-native-skia";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import { Canvas, Path, useCanvasRef, Picture } from "@shopify/react-native-skia";
import { FadeIn, runOnJS } from 'react-native-reanimated';
import { SFSymbol } from 'react-native-sfsymbols';
import Config from 'react-native-config';
import Animated from 'react-native-reanimated';

import auth from '@react-native-firebase/auth';
import database from "@react-native-firebase/database"
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'

const screenHeight = Dimensions.get("screen").height;
const screenWidth = Dimensions.get("screen").width;

import Svg, { Circle } from "react-native-svg"
// yarn ios--simulator "iPhone 15 Pro"
export default function CameraPage() {

  const [words, setWords] = useState([])

  async function getWords() {
    let uid = auth().currentUser.uid;
    let option = "translatedDefinition"
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
        console.log(words)
      })
  }

  useEffect(() => {
    getWords()
  }, [])


  const genAI = new GoogleGenerativeAI(Config.API_KEY);
  const [englishWord, setEnglishWord] = useState(null)
  const [englishDefinition, setEnglishDefinition] = useState(null)
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

  const addWord = (englishWord, englishDefinition, translatedWord, translatedDefinition) => {
    const uid = auth().currentUser.uid;
    database()
      .ref(`/${uid}/words`)
      .update({
        [englishWord]: {
          translatedWord: translatedWord,
          definition: englishDefinition,
          translatedDefinition: translatedDefinition,
          score: 1
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

    console.log(Config.API_KEY)

    const prompt = `
    Given this image.
    Language: "Spanish"
    For the highlighted word in the image and the above language, provide its English definition (in 12 words or less), its translation in the provided language, and its definition in the provided language (in 12 words or less). Use this JSON schema:
    { "originalWord": "string",
      "englishDefinition": "string", 
      "translatedWord": "string",
      "translatedDefinition": "string"
    }`

    const result = await model.generateContent([prompt, { inlineData: { data: imageData, mimeType: 'image/png' } }]);
    const response = result.response;
    const text = JSON.parse(response.text());
    console.log(text)
    console.log("response")
    setEnglishWord(text.originalWord)
    setEnglishDefinition(text.englishDefinition)
    setTranslatedWord(text.translatedWord)
    setTranslatedDefinition(text.translatedDefinition)
    addWord(text.originalWord, text.englishDefinition, text.translatedWord, text.translatedDefinition);
    openTextSheet();
    setLoading(false)

    // setResponse(JSON.stringify(text))
  }


  const [paths, setPaths] = useState([]);
  const canvasRef = useCanvasRef();


  const camera = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(true);
  const [image, setImage] = useState(null);
  const loadedImage = useImage(image);
  const device = useCameraDevice('back')
  const { hasPermission, requestPermission } = useCameraPermission()

  const [currentPosition, setCurrentPosition] = useState(-1)

  const saveMarkedUpImage = async () => {
    console.log("sup")
    setLoading(true)
    const image = await canvasRef.current.makeImageSnapshotAsync();
    const bytes = image.encodeToBase64();
    // console.log(bytes)
    define(bytes)

  };

  const [tGestureStart, setTGestureStart] = useState(null);
  const [tGestureMove, setTGestureMove] = useState(null);
  const [tGestureUpdate, setTGestureUpdate] = useState(null);
  const [tGestureEnd, setTGestureEnd] = useState(null);

  const pan = Gesture.Pan()
    .onStart((g) => {
      const newPaths = [...paths];
      newPaths[paths.length] = {
        segments: [],
        color: "yellow",
      };
      newPaths[paths.length].segments.push(`M ${g.x} ${g.y}`);
      runOnJS(setPaths)(newPaths);
      runOnJS(setTGestureStart)(`${Math.round(g.x)}, ${Math.round(g.y)}`);
    })
    .onUpdate((g) => {
      const index = paths.length - 1;
      const newPaths = [...paths];
      if (newPaths?.[index]?.segments) {
        newPaths[index].segments.push(`L ${g.x} ${g.y}`);
        runOnJS(setPaths)(newPaths);
      }
    }).minDistance(1)
  useEffect(() => {
    if (!hasPermission)
      requestPermission()

  }, [])


  if (hasPermission)
    return (
      // <SafeAreaView style={styles.backgroundContainer}>
      <>
        <View style={{ backgroundColor: "black", flex: 1 }}>

          <View style={styles.tabBar}>
            <SFSymbol name="camera.fill" size={18} color="#2F2C2A" />
            <SFSymbol name="doc.on.doc.fill" size={18} color="#2F2C2A" style={{ opacity: 0.21 }} />
            <SFSymbol name="character.book.closed.fill" size={18} color="#2F2C2A" style={{ opacity: 0.21 }} />
          </View>
          {cameraOpen ?
            <>
              <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}
              >
              </Camera>
              <View style={{ flex: 1, }}>
                <View style={styles.buttonContainer}>
                  <Pressable style={{ ...styles.actionButton, opacity: 0 }}>
                    <Text style={styles.languageText}>EN</Text>
                  </Pressable>
                  <Pressable onPress={async () => {
                    const photo = await camera.current.takePhoto();
                    console.log(photo.path)
                    setCameraOpen(false)
                    setImage(photo.path)
                    // highlightPhoto(photo.path)
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
                  <Pressable style={styles.actionButton}>
                    <SFSymbol name="photo.on.rectangle.angled" size={25} color="white" />
                  </Pressable>
                </View>
              </View>
            </>
            : <>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <GestureDetector gesture={pan}>
                  <View style={styles.drawingContainer}>
                    {/* <Image source={{
                  uri: image,
                }} style={styles.image} /> */}

                    <Canvas style={styles.canvas} ref={canvasRef}>
                      {/* {testImg ? */}
                      <Image image={loadedImage} fit="cover" x={0} y={0} width={screenWidth} height={screenHeight} />
                      {paths.map((p, index) => (
                        <Path
                          key={index}
                          path={p.segments.join(" ")}
                          strokeWidth={30}
                          style="stroke"
                          color={p.color}
                          opacity={0.5}
                        />
                      ))}
                    </Canvas>
                    <View style={{ ...StyleSheet.absoluteFill, position: "absolute", zIndex: 100 }}>
                      <Pressable onPress={() => {
                        setPaths([]);
                        console.log(loadedImage)
                      }}>
                        <Text style={{ fontSize: 20, position: "absolute", top: screenHeight * 0.08, color: "white", paddingLeft: 20, textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 }}>Clear</Text>
                      </Pressable>
                      <Pressable onPress={() => {
                        setCameraOpen(true);
                      }}>
                        <Text style={{ fontSize: 20, position: "absolute", top: screenHeight * 0.08, color: "white", right: 0, paddingRight: 20, textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 }}>Retake</Text>
                      </Pressable>
                      <View style={styles.buttonContainer}>
                        <Pressable onPress={() => { if (!loading) saveMarkedUpImage() }} style={styles.bigActionButton}>
                          {!loading
                            ? <SFSymbol name="checkmark" size={32} color="black" />
                            : <ActivityIndicator />
                          }
                        </Pressable>
                      </View>
                      <Text style={{ fontSize: 18, position: "absolute", top: screenHeight * 0.75, alignSelf: "center", color: "white", textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 }}>Highlight text to define in Spanish.</Text>
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
          onChange={index => setCurrentPosition(index)}
        >
          <BottomSheetView style={styles.contentContainer}>
            <Text style={styles.title}>Definitions</Text>
            <FlatList
              data={words}
              contentContainerStyle={{ gap: 10, paddingBottom: 30, alignSelf: "center" }}
              renderItem={({ item }) => {
                console.log(item)
                return (<Term word={item.word} translatedWord={item.translatedWord} translatedDefinition={item.translatedDefinition} />)
              }}
              ListHeaderComponent={
                currentPosition !== -1 ?
                <Animated.View entering={FadeIn.duration(1000)} style={{ ...styles.termContainer, alignSelf: "center",}}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingBottom: 12, }}>
                    <Text style={styles.termTitle}>{englishWord}</Text>
                    <SFSymbol name="speaker.wave.2.fill" size={20} color="#77BEE9" />
                  </View>
                  <Text style={styles.termSubtitle}>{translatedWord} · {translatedDefinition}</Text>
                </Animated.View>
                : <View style={{ ...styles.termContainer, alignSelf: "center", opacity: 0}}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", width: "95%", paddingBottom: 12, }}>
                  <Text style={styles.termTitle}>{englishWord}</Text>
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
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
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
    backgroundColor: "#F0E8DD",
    borderRadius: 40,
  },
  buttonContainer: {
    position: "absolute",
    top: screenHeight * 0.8,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    width: "100%"
  },
})

