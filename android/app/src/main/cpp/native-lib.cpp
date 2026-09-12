// JNI 桥接层:调用 nodejs-mobile 的 node::Start 把 embedded Node.js 跑起来。
// 参考 nodejs-mobile 官方 Android getting-started 示例。
#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include "node.h"

#ifdef __cplusplus
extern "C" {
#endif

jint JNICALL
Java_com_richman_app_MainActivity_startNodeWithArguments(
    JNIEnv *env,
    jobject /*thiz*/,
    jobjectArray arguments) {
  jsize argument_count = env->GetArrayLength(arguments);

  // 统计 argv 连续缓冲所需字节数
  int c_arguments_size = 0;
  for (int i = 0; i < argument_count; i++) {
    jstring str = (jstring)env->GetObjectArrayElement(arguments, i);
    const char *s = env->GetStringUTFChars(str, 0);
    c_arguments_size += (int)strlen(s);
    c_arguments_size++;  // 每个入参后的 '\0'
    env->ReleaseStringUTFChars(str, s);
  }

  char *args_buffer = (char *)calloc(c_arguments_size, sizeof(char));
  if (!args_buffer) {
    return -1;
  }

  // nodejs-mobile 的 node::Start 声明为 char* argv[] (见 node.h)
  char *argv[argument_count];
  char *current = args_buffer;

  for (int i = 0; i < argument_count; i++) {
    jstring str = (jstring)env->GetObjectArrayElement(arguments, i);
    const char *s = env->GetStringUTFChars(str, 0);
    strcpy(current, s);
    argv[i] = current;
    current += strlen(current) + 1;
    env->ReleaseStringUTFChars(str, s);
  }

  int node_result = node::Start(argument_count, argv);
  free(args_buffer);
  return (jint)node_result;
}

#ifdef __cplusplus
}
#endif