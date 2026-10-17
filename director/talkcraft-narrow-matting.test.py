import unittest
import importlib.util
from pathlib import Path
import numpy as np

spec=importlib.util.spec_from_file_location('matting',Path(__file__).with_name('talkcraft-narrow-matting.py'))
matting=importlib.util.module_from_spec(spec)
spec.loader.exec_module(matting)

class NarrowMattingTests(unittest.TestCase):
    def fixture(self):
        src=np.zeros((48,48,3),np.uint8); src[:]=[0,255,0]
        mask=np.zeros((48,48),np.uint8)
        mask[8:40,12:32]=255; mask[5:10,14]=255; mask[17:25,32:35]=255
        for y in range(35,44): mask[y,12:32+(y-35)]=255
        src[mask==255]=[190,130,95]
        return src,np.dstack((src,mask))

    def test_opaque_core_and_background_are_unchanged(self):
        src,base=self.fixture(); result=matting.refine_frame(src,base)
        np.testing.assert_array_equal(result[14:30,16:28],base[14:30,16:28])
        np.testing.assert_array_equal(result[:3,:,3],0)

    def test_edge_has_subpixel_coverage_without_eroding_thin_features(self):
        src,base=self.fixture(); result=matting.refine_frame(src,base)
        self.assertTrue(np.any((result[:,:,3]>0)&(result[:,:,3]<255)))
        self.assertGreater(int(result[7,14,3]),127,'one-pixel hair retains majority coverage')
        self.assertEqual(int(result[20,33,3]),255,'finger core remains opaque')
        self.assertEqual(int(result[39,20,3]),255,'shoe interior remains opaque')

    def test_frame_independence_preserves_stationary_edges(self):
        src,base=self.fixture(); before=matting.refine_frame(src,base)
        other=src.copy(); other[:]=[0,255,0]
        matting.refine_frame(other,np.zeros_like(base))
        np.testing.assert_array_equal(before,matting.refine_frame(src,base))

    def test_intermediate_colors_cannot_modify_subject_core(self):
        src,base=self.fixture(); base[20,20,:3]=[30,36,25]
        result=matting.refine_frame(src,base)
        np.testing.assert_array_equal(result[20,20,:3],src[20,20])

    def test_opaque_green_tinted_subject_is_not_globally_despilled(self):
        src,base=self.fixture(); src[20,20]=[90,104,95]
        result=matting.refine_frame(src,base)
        np.testing.assert_array_equal(result[20,20,:3],src[20,20])

if __name__=='__main__': unittest.main()
