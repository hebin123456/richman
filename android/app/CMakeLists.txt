cmake_minimum_required(VERSION 3.22.1)
project("richman_nodeproj" CXX)

include_directories(libnode/include/node/)

# 导入 nodejs-mobile 预编译的动态库(由 scripts/fetch-libnode.sh 下载)
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so
)

add_library(native-lib SHARED src/main/cpp/native-lib.cpp)
target_link_libraries(
    native-lib
    libnode
    ${log-lib}
)