import { View, Text, SafeAreaView, Pressable, StyleSheet, FlatList, Dimensions, Image, TextInput, ActivityIndicator } from 'react-native';
import React, { useRef, useState, useEffect } from 'react';
import Animated, { useSharedValue, interpolate, useAnimatedStyle, withTiming, withRepeat, Easing, interpolateColor } from 'react-native-reanimated';
import Config from "react-native-config"
import auth from '@react-native-firebase/auth';
import database from "@react-native-firebase/database";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg"
import { SFSymbol } from 'react-native-sfsymbols';

const screenHeight = Dimensions.get("screen").height;
const screenWidth = Dimensions.get("screen").width;

// Initializing model
const genAI = new GoogleGenerativeAI(Config.API_KEY);
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

export default function StudyPage({ language }) {
  const [flashcards, setFlashcards] = useState(null);
  const [MCQs, setMCQs] = useState(null)

  // Loading animation
  const rotate = useSharedValue("0deg")
  useEffect(() => {
    if (!flashcards && !MCQs)
      rotate.value = withRepeat(withTiming("360deg", { duration: 1000, }), -1)

  }, [flashcards, MCQs])



  // Creating question flatlist
  const ref = useRef();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const goNextSlide = () => {
    setTimeout(() => {
      const nextSlideIndex = currentSlideIndex + 1;
      if (nextSlideIndex != flashcards.length) {
        const offset = nextSlideIndex * screenWidth;
        ref?.current?.scrollToOffset({ offset });
        setCurrentSlideIndex(nextSlideIndex);
      } else {
        console.log("DONE!")
      }
    }, 1000);
  }
  const updateCurrentSlideIndex = e => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const currentIndex = Math.round(contentOffsetX / screenWidth);
    setCurrentSlideIndex(currentIndex)
  }

  // Generating all MCQs
  async function createMCQs(mcqs) {
    const words = mcqs.map(item => item.front);
    const prompt = `
    Words: ${words}
    Question: "What does (word) mean?"
    Given this information, generate two wrong but misleading answers to the 
    question. Put the correct answer in one of the multiple choices as well. Please output your answer in the following schema, continuing until all words have been included:
    { "(word1)": 
      {
        "question": "What does (word) mean?",
        "choices: {
          "A": "option",
          "B": "option",
          "C": "option"
        },
        correctAnswer: "letter",
      },
      "(word2)":
      {
        "question": "What does (word) mean?",
        "choices: {
          "A": "option",
          "B": "option",
          "C": "option"
        },
        correctAnswer: "letter",
      },
      ...
    }`
    if (words.length) {
      const resultResponse = await model.generateContent(prompt);
      const response = resultResponse.response;
      const mcqJSON = JSON.parse(response.text());
      setMCQs(mcqJSON)
      console.log(mcqJSON)
    } else {
      setMCQs([])
      console.log("No MCQs!")
    }
  }

  // Sorts terms into flashcard, MCQ, and FRQ
  function sortTerms() {
    let uid = auth().currentUser.uid;
    database()
      .ref(`${uid}/words`)
      .once('value')
      .then(snapshot => {
        let words = snapshot.val();

        let flashcards = [];
        let mcqs = []

        for (const word in words) {
          let score = words[word]["score"]
          let card = { front: word, back: words[word]["translatedDefinition"], frontFacing: true, score: words[word]["score"] };
          if (score == 2) {
            card.type = "frq"
          } else if (score == 1) {
            card.type = "mcq"
            mcqs.push(card)
          } else {
            card.type = "flashcard"
          }
          flashcards.push(card)
        }
        // console.log(flashcards)

        // order terms -> flashcards, mcqs, frqs (by score)
        const sortedFlashcards = flashcards.sort((a, b) => {
          let x = a.score;
          let y = b.score

          if (x > y) return 1
          if (y > x) return -1
          return 0
        })

        createMCQs(mcqs);
        setFlashcards(sortedFlashcards);
      });
  }

  useEffect(() => {
    sortTerms();
  }, []);


  // Renders questions (if terms are done sorting and MCQs have been generated, if applicable)
  if (flashcards && MCQs)
    return (
      <SafeAreaView style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#F5EEE5", height: screenHeight }}>
        <View style={styles.container}>
          <Text style={styles.title}>Practice</Text>
          <FlatList
            data={flashcards}
            ref={ref}
            horizontal
            renderItem={({ item, index }) => (
              <Flashcard
                mcqs={MCQs}
                key={item.front}
                front={item.front}
                back={item.back}
                frontFacing={item.frontFacing}
                toggleFacing={() => {
                  const newFlashcards = [...flashcards];
                  newFlashcards[index].frontFacing = !newFlashcards[index].frontFacing;
                  setFlashcards(newFlashcards);
                }}
                score={item.score}
                type={item.type}
                goNextSlide={goNextSlide}
                language={language}
              />
            )}
            pagingEnabled
            onMomentumScrollEnd={updateCurrentSlideIndex}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.front}
            style={{ zIndex: 100 }}
            scrollEnabled={false}
          />
        </View>

      </SafeAreaView >
    );



  // loading
  return (
    <>
      <SafeAreaView style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#F5EEE5", height: screenHeight }}>
        <View style={styles.container}>
          <Text style={styles.title}>Practice</Text>
          <View style={{ width: screenWidth, justifyContent: "center", alignItems: "center" }}>
            <View style={styles.back}>
              <Animated.View style={{ transform: [{ rotate: rotate }] }}>
                <Svg
                  width={50}
                  height={50}
                  viewBox="0 0 17 17"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <Path
                    d="M8.5 17a.694.694 0 01-.485-.188.81.81 0 01-.247-.477 33.306 33.306 0 00-.435-2.447c-.147-.688-.33-1.27-.545-1.748a3.85 3.85 0 00-.792-1.202 3.677 3.677 0 00-1.192-.793c-.477-.204-1.054-.375-1.73-.511a33.305 33.305 0 00-2.384-.4.793.793 0 01-.503-.24A.706.706 0 010 8.5a.69.69 0 01.196-.494.824.824 0 01.494-.248c1.107-.12 2.038-.261 2.793-.426.756-.17 1.377-.404 1.866-.7A3.45 3.45 0 006.54 5.449c.301-.5.542-1.14.724-1.918.182-.78.35-1.737.503-2.874A.81.81 0 018.015.18.713.713 0 018.5 0a.67.67 0 01.468.179c.137.12.222.279.256.477.159 1.137.33 2.095.511 2.874.187.773.431 1.41.732 1.91.301.494.696.889 1.184 1.184.489.296 1.11.529 1.866.7.755.164 1.686.31 2.793.434.193.029.355.111.486.248A.674.674 0 0117 8.5a.674.674 0 01-.204.494.785.785 0 01-.494.24 26.945 26.945 0 00-2.794.443c-.755.164-1.38.395-1.874.69a3.451 3.451 0 00-1.184 1.194c-.295.494-.536 1.13-.724 1.91a30.81 30.81 0 00-.502 2.864.752.752 0 01-.247.477A.664.664 0 018.5 17z"
                    fill="url(#paint0_linear_49_1672)"
                  />
                  <Path
                    d="M8.5 17a.694.694 0 01-.485-.188.81.81 0 01-.247-.477 33.306 33.306 0 00-.435-2.447c-.147-.688-.33-1.27-.545-1.748a3.85 3.85 0 00-.792-1.202 3.677 3.677 0 00-1.192-.793c-.477-.204-1.054-.375-1.73-.511a33.305 33.305 0 00-2.384-.4.793.793 0 01-.503-.24A.706.706 0 010 8.5a.69.69 0 01.196-.494.824.824 0 01.494-.248c1.107-.12 2.038-.261 2.793-.426.756-.17 1.377-.404 1.866-.7A3.45 3.45 0 006.54 5.449c.301-.5.542-1.14.724-1.918.182-.78.35-1.737.503-2.874A.81.81 0 018.015.18.713.713 0 018.5 0a.67.67 0 01.468.179c.137.12.222.279.256.477.159 1.137.33 2.095.511 2.874.187.773.431 1.41.732 1.91.301.494.696.889 1.184 1.184.489.296 1.11.529 1.866.7.755.164 1.686.31 2.793.434.193.029.355.111.486.248A.674.674 0 0117 8.5a.674.674 0 01-.204.494.785.785 0 01-.494.24 26.945 26.945 0 00-2.794.443c-.755.164-1.38.395-1.874.69a3.451 3.451 0 00-1.184 1.194c-.295.494-.536 1.13-.724 1.91a30.81 30.81 0 00-.502 2.864.752.752 0 01-.247.477A.664.664 0 018.5 17z"
                  />
                  <Defs>
                    <LinearGradient
                      id="paint0_linear_49_1672"
                      x1={2}
                      y1={2.5}
                      x2={15}
                      y2={16}
                      gradientUnits="userSpaceOnUse"
                    >
                      <Stop stopColor="#65BAEE" />
                      <Stop offset={1} stopColor="#FD8DFF" />
                    </LinearGradient>
                  </Defs>
                </Svg>
              </Animated.View>
              <Text style={{ paddingTop: 20, fontSize: 20, fontFamily: "NewYorkLarge-Regular", color: "gray" }}>Preparing your session...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  )
}

function Flashcard({ mcqs, front, back, frontFacing, toggleFacing, type, goNextSlide, language }) {
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState(null)

  const [loading, setLoading] = useState(null);
  const [FRQcorrect, setFRQcorrect] = useState(null);
  const [FRQfeedback, setFRQfeedback] = useState(null);


  // function getScore() {
  //   let uid = auth().currentUser.uid;
  //   database()
  //     .ref(`${uid}/words/${front}`)
  //     .once('value')
  //     .then(snapshot => {
  //       let word = snapshot.val();
  //       let currentScore = word["score"] || 0;

  //       setScore(currentScore)
  //       // console.log(currentScore)
  //     })
  //     .catch(error => {
  //       console.error("Error reading score: ", error);
  //     });
  // }

  // useEffect(() => {
  //   getScore();
  // }, [])

  function addScore() {
    let uid = auth().currentUser.uid;
    database()
      .ref(`${uid}/words/${front}`)
      .once('value')
      .then(snapshot => {
        let word = snapshot.val();
        let currentScore = word["score"] || 0;
        let newScore = currentScore + 1;

        // Update the score in Firebase
        database().ref(`${uid}/words/${front}`).update({ score: newScore });
      })
      .catch(error => {
        console.error("Error updating score: ", error);
      });
  }

  // Animated styles for flashcard flip
  const spin = useSharedValue(frontFacing ? 0 : 1);
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const spinVal = interpolate(spin.value, [0, 1], [0, 180]);
    return {
      transform: [
        {
          rotateX: withTiming(`${spinVal}deg`, { duration: 500 }),
        },
      ],
    };
  }, []);
  const backAnimatedStyle = useAnimatedStyle(() => {
    const spinVal = interpolate(spin.value, [0, 1], [180, 360]);
    return {
      transform: [
        {
          rotateX: withTiming(`${spinVal}deg`, { duration: 500 }),
        },
      ],
    };
  }, []);
  const handlePress = () => {
    spin.value = spin.value ? 0 : 1;
    toggleFacing();
  };

  // Interpolate styles for button color changes
  const showAnswer = useSharedValue(0);
  const correctColor = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        showAnswer.value,
        [0, 1],
        ["#2F2C2A", "#9BDD48"]
      )
    }
  })
  const wrongColor = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        showAnswer.value,
        [0, 1],
        ["#2F2C2A", "#DD6348"]
      )
    }
  })



  // For FRQ: evaluate sentence
  const evaluateFRQ = async () => {
    setLoading(true);
    const prompt = `
    Evaluate whether the following sentence is grammatically correct in the language of the word "${front}". To be correct, the sentence must include the word "${front}" correctly. 
    
    Sentence: ${answer}

    Provide feedback if the sentence is not correct. This feedback must be a full sentence written in ${language} 15 words or less. It must explain what is wrong and what would be correct.
    If the word "${front}" is not used in the sentence, feedback should be "You didn't use "${front}" in the sentence!"
    Answer in the following schema:
    {
      correct: boolean,
      feedback: string or null
    }
    `

    const resultResponse = await model.generateContent(prompt);
    const response = resultResponse.response;
    const resultFRQ = JSON.parse(response.text());

    console.log(resultFRQ)

    console.log(resultFRQ.correct)
    setFRQcorrect(resultFRQ.correct);
    setFRQfeedback(resultFRQ.feedback);
    showAnswer.value = withTiming(1, { duration: 250 });
    setLoading(false);
  }


  return (
    <View style={{ width: screenWidth, justifyContent: "center", alignItems: "center" }}>
      {type == "flashcard"
        && <>
          <Animated.View style={[styles.front, frontAnimatedStyle]}>
            <Text style={{ fontFamily: "SFPro-Semibold", fontSize: 17, position: "absolute", top: screenHeight * 0.03 }}>Quiz yourself</Text>
            <Pressable style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
              {
                <Text style={styles.bigCardText}>{front}</Text>
              }
            </Pressable>
          </Animated.View>
          <Animated.View style={[styles.back, backAnimatedStyle]}>
            <Pressable style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
              <Text style={styles.smallCardText}>{back}</Text>
            </Pressable>
          </Animated.View>
        </>
      }
      {type == "mcq"
        && <>
          <View style={styles.back}>
            <Pressable style={{ width: "100%", height: "100%", alignItems: "center", padding: 20 }}>
              <Text style={{ fontFamily: "SFPro-Semibold", fontSize: 17, position: "absolute", top: screenHeight * 0.03 }}>Choose the best answer</Text>
              <Text style={{ fontFamily: "NewYorkLarge-Regular", fontSize: 25, textAlign: "center", position: "absolute", top: screenHeight * 0.1 }}>What does <Text style={{ fontFamily: "NewYorkLarge-Semibold" }}>{front}</Text> mean?</Text>
              <View style={{ position: "absolute", top: screenHeight * 0.2, alignItems: "center", gap: 20 }}>
                <Text style={styles.smallCardText}><Text style={{ fontFamily: "NewYorkLarge-Semibold" }}>A.</Text> {mcqs[front].choices.A}</Text>
                <Text style={styles.smallCardText}><Text style={{ fontFamily: "NewYorkLarge-Semibold" }}>B.</Text> {mcqs[front].choices.B}</Text>
                <Text style={styles.smallCardText}><Text style={{ fontFamily: "NewYorkLarge-Semibold" }}>C.</Text> {mcqs[front].choices.C}</Text>
              </View>
            </Pressable>
          </View>
        </>
      }
      {type == "frq"
        && <>
          <View style={styles.back}>
            <Pressable style={{ width: "100%", height: "100%", alignItems: "center", padding: 20 }}>
              <Text style={{ fontFamily: "SFPro-Semibold", fontSize: 17, position: "absolute", top: screenHeight * 0.03, textAlign: "center", }}>Write a sentence with the following word</Text>
              <Text style={{ fontFamily: "NewYorkLarge-Regular", fontSize: 25, textAlign: "center", position: "absolute", top: screenHeight * 0.13 }}><Text style={{ fontFamily: "NewYorkLarge-Semibold" }}>{front}</Text></Text>
              <TextInput style={{ position: "absolute", top: screenHeight * 0.2, alignItems: "center", gap: 20, width: "100%", fontSize: 18, }} placeholder="Start typing..." multiline blurOnSubmit value={answer} onChangeText={setAnswer} />
            </Pressable>
          </View>
        </>
      }

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <Image source={require("./graph.png")} style={styles.graph}></Image>
      </View>

      {/* Bottom buttons */}
      {type == "flashcard" ?
        !frontFacing
          ? <View style={styles.btnContainer}>
            <Animated.View style={[styles.defaultBtn, answer === false ? wrongColor : { backgroundColor: "#2F2C2A" }]}>
              <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                if (!answer) {
                  setAnswer(false)
                  showAnswer.value = withTiming(1, { duration: 250 });
                  goNextSlide()
                }
              }}>
                <SFSymbol name="xmark" size={25} color="white" />
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.defaultBtn, answer === true ? correctColor : { backgroundColor: "#2F2C2A" }]}>
              <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                if (!answer) {
                  setAnswer(true)
                  showAnswer.value = withTiming(1, { duration: 250 });
                  goNextSlide()
                }
              }}>
                <SFSymbol name="checkmark" size={25} color="white" />
              </Pressable>
            </Animated.View>
          </View>
          : <View style={styles.btnContainer}>
            <Animated.View style={[styles.defaultBtn, { backgroundColor: "#2F2C2A" }]}>
              <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                handlePress()
              }}>
                <SFSymbol name="arrow.triangle.2.circlepath" size={25} color="white" />
              </Pressable>
            </Animated.View>
          </View>
        : null
      }
      {
        type == "mcq" &&
        (
          <>
            <View style={styles.btnContainer}>
              {/* if correct answer, turn green. if selected and wrong answer, turn red. else, continue being black */}
              <Animated.View style={[styles.defaultBtn, mcqs[front].correctAnswer == "A" ? correctColor : answer === "A" ? wrongColor : { backgroundColor: "#2F2C2A" }]}>
                <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                  if (!answer) {
                    setAnswer("A")
                    showAnswer.value = withTiming(1, { duration: 250 });
                    goNextSlide()
                  }
                }}>
                  <Text style={{ fontSize: 20, color: "#F0E8DD" }}>A</Text>
                </Pressable>
              </Animated.View>

              <Animated.View style={[styles.defaultBtn, mcqs[front].correctAnswer == "B" ? correctColor : answer === "B" ? wrongColor : { backgroundColor: "#2F2C2A" }]}>
                <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                  if (!answer) {
                    setAnswer("B")
                    showAnswer.value = withTiming(1, { duration: 250 });
                    goNextSlide()
                  }
                }}>
                  <Text style={{ fontSize: 20, color: "#F0E8DD" }}>B</Text>
                </Pressable>
              </Animated.View>

              <Animated.View style={[styles.defaultBtn, mcqs[front].correctAnswer == "C" ? correctColor : answer === "C" ? wrongColor : { backgroundColor: "#2F2C2A" }]}>
                <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                  if (!answer) {
                    setAnswer("C")
                    showAnswer.value = withTiming(1, { duration: 250 });
                    goNextSlide()
                  }
                }}>
                  <Text style={{ fontSize: 20, color: "#F0E8DD" }}>C</Text>
                </Pressable>
              </Animated.View>
            </View>
          </>
        )
      }
      {
        type == "frq" &&
        (
          <>
            <View style={styles.btnContainer}>
              <Animated.View style={[styles.defaultBtn, FRQcorrect == true ? correctColor : FRQcorrect === false ? wrongColor : { backgroundColor: answer ? "#2F2C2A" : "#A6A19D" }]}>
                <Pressable style={{ ...styles.defaultBtn }} onPress={() => {
                  if (answer) {
                    evaluateFRQ()
                    // goNextSlide()
                  }
                }}>
                  { loading
                  ? <ActivityIndicator />
                  : <SFSymbol name="arrow.up" size={25} color="white" />

                  }
                </Pressable>
              </Animated.View>
            </View>
          </>
        )
      }

    </View>
  );
}


const styles = StyleSheet.create({
  btnContainer: {
    position: "absolute",
    top: screenHeight * 0.67,
    flexDirection: "row",
    gap: 20,
  },
  defaultBtn: {
    // backgroundColor: "#2F2C2A",
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  correctBtn: {
    backgroundColor: "#9BDD48",
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  wrongBtn: {
    backgroundColor: "#DD6348",
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  bigCardText: {
    fontFamily: "NewYorkLarge-Regular",
    fontSize: 40,
    textAlign: "center"
  },
  smallCardText: {
    fontFamily: "NewYorkLarge-Regular",
    fontSize: 20,
    textAlign: "center"
  },
  title: {
    fontFamily: "NewYorkLarge-Semibold",
    fontSize: 34,
  },
  debugButton: {
    backgroundColor: "#FFCC32",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginBottom: 20,
    width: "90%"
  },
  front: {
    backgroundColor: "#FFFCF7",
    borderRadius: 16,
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
    width: screenWidth * 0.8,
    height: screenHeight * 0.5,
    shadowOffset: 3,
    shadowRadius: 3,
    shadowColor: "black",
    shadowOpacity: 0.3,
    top: screenHeight * 0.04
  },
  back: {
    backgroundColor: "#FFFCF7",
    borderRadius: 16,
    backfaceVisibility: "hidden",
    alignItems: "center",
    justifyContent: "center",
    width: screenWidth * 0.8,
    height: screenHeight * 0.5,
    shadowOffset: 3,
    shadowRadius: 3,
    shadowColor: "black",
    shadowOpacity: 0.3,
    top: screenHeight * 0.04,
    position: "absolute"
  },
  container: {
    position: "absolute",
    top: screenHeight * 0.15,
    alignItems: "center",
    // backgroundColor: "red",
    height: "100%",
  },
  progressBar: {
    position: "absolute",
    top: screenHeight * 0.6
  }
});
