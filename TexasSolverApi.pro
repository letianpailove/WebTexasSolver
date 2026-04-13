QT += core

TARGET = api
TEMPLATE = lib
CONFIG += release dll

DEFINES += QT_DEPRECATED_WARNINGS

win32-g++: {
QMAKE_CXXFLAGS += -fopenmp
QMAKE_LFLAGS += -fopenmp
}

win32-msvc*: {
QMAKE_CXXFLAGS += -openmp
QMAKE_LFLAGS += -openmp
}

linux: {
QMAKE_CXXFLAGS += -fopenmp
QMAKE_LFLAGS += -fopenmp
}

QMAKE_CXXFLAGS_RELEASE *= -O2

INCLUDEPATH += .

SOURCES += \
    src/api.cpp \
    src/Deck.cpp \
    src/Card.cpp \
    src/GameTree.cpp \
    src/library.cpp \
    src/compairer/Dic5Compairer.cpp \
    src/experimental/TCfrSolver.cpp \
    src/nodes/ActionNode.cpp \
    src/nodes/ChanceNode.cpp \
    src/nodes/GameActions.cpp \
    src/nodes/GameTreeNode.cpp \
    src/nodes/ShowdownNode.cpp \
    src/nodes/TerminalNode.cpp \
    src/ranges/PrivateCards.cpp \
    src/ranges/PrivateCardsManager.cpp \
    src/ranges/RiverCombs.cpp \
    src/ranges/RiverRangeManager.cpp \
    src/runtime/PokerSolver.cpp \
    src/solver/BestResponse.cpp \
    src/solver/CfrSolver.cpp \
    src/solver/PCfrSolver.cpp \
    src/solver/Solver.cpp \
    src/tools/CommandLineTool.cpp \
    src/tools/GameTreeBuildingSettings.cpp \
    src/tools/lookup8.cpp \
    src/tools/PrivateRangeConverter.cpp \
    src/tools/progressbar.cpp \
    src/tools/Rule.cpp \
    src/tools/StreetSetting.cpp \
    src/tools/utils.cpp \
    src/trainable/CfrPlusTrainable.cpp \
    src/trainable/DiscountedCfrTrainable.cpp \
    src/trainable/DiscountedCfrTrainableHF.cpp \
    src/trainable/DiscountedCfrTrainableSF.cpp \
    src/trainable/Trainable.cpp

